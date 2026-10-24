import type { StageId, World } from "./model";
import { addFreeBelt, validateFreeLoop, FREE_BELT_MAX_POINTS, syncFreeBeltContacts } from "./freeBelt";
import { addPlacedBelt, addPlacedBlower, addPlacedGear, addStroke, createStage } from "./world";
import { addPlacedGate, syncGateColliders } from "./gate";
import { addRecvTruckStop } from "./recvTruck";
export const SAVE_VERSION = 3;
export const SAVE_SLOT_COUNT = 3;
const SLOT_KEY_PREFIX = "chunball.remix.save.slot.";
export type PlacedPartSave = {
    type: "freeBelt";
    points: {
        x: number;
        y: number;
    }[];
    length: number;
    gearParts?: number[];
} | {
    type: "gear";
    x: number;
    y: number;
    r: number;
    drive: number;
    motorKind?: "motor" | "follower";
    frictionContact?: boolean;
    motorFrictionContact?: boolean;
    speedLevel?: 1 | 2 | 3 | 4 | 5;
    angle: number;
} | {
    type: "stroke";
    points: {
        x: number;
        y: number;
    }[];
} | {
    type: "belt";
    ax: number;
    ay: number;
    bx: number;
    by: number;
} | {
    type: "blower";
    x: number;
    y: number;
    angle: number;
} | {
    type: "gate";
    x: number;
    y: number;
    angle: number;
    open: boolean;
} | {
    type: "truckStop";
    id: number;
    inletX: number;
    inletY: number;
};
export type SaveGame = {
    version: number;
    savedAt: string;
    stageId: StageId;
    stageState: {};
    placedParts: PlacedPartSave[];
};
export type SlotInfo = {
    index: number;
    empty: boolean;
    corrupt: boolean;
    save: SaveGame | null;
};
const STAGE_LABELS: Record<StageId, string> = {
    sewer: "下水道",
    free: "フリー",
    sandbox: "完全フリー",
    wash: "洗濯機",
};
export function stageLabel(id: StageId): string {
    return STAGE_LABELS[id] ?? id;
}
export function formatSavedAt(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${day} ${hh}:${mm}`;
}
function slotKey(index: number): string {
    return `${SLOT_KEY_PREFIX}${index + 1}`;
}
function isStageId(v: unknown): v is StageId {
    return v === "sewer" || v === "free" || v === "sandbox" || v === "wash";
}
function isFiniteNum(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}
export function parseSaveGame(raw: unknown): SaveGame | null {
    if (!raw || typeof raw !== "object")
        return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.version !== "number")
        return null;
    if (o.version !== 1 && o.version !== 2 && o.version !== SAVE_VERSION)
        return null;
    if (typeof o.savedAt !== "string")
        return null;
    if (!isStageId(o.stageId))
        return null;
    if (!o.stageState || typeof o.stageState !== "object")
        return null;
    const ss = o.stageState as Record<string, unknown>;
    if (!Array.isArray(o.placedParts))
        return null;
    const placedParts: PlacedPartSave[] = [];
    for (const part of o.placedParts) {
        const p = parsePlacedPart(part);
        if (!p)
            return null;
        placedParts.push(p);
    }
    for (const p of placedParts)
        if (p.type === "freeBelt" && p.gearParts?.some(i => placedParts[i]?.type !== "gear"))
            return null;
    return {
        version: SAVE_VERSION,
        savedAt: o.savedAt,
        stageId: o.stageId,
        stageState: {},
        placedParts,
    };
}
function parsePlacedPart(raw: unknown): PlacedPartSave | null {
    if (!raw || typeof raw !== "object")
        return null;
    const o = raw as Record<string, unknown>;
    if (o.type === "freeBelt") {
        if (!Array.isArray(o.points) || o.points.length > FREE_BELT_MAX_POINTS || !isFiniteNum(o.length))
            return null;
        const points: {
            x: number;
            y: number;
        }[] = [];
        for (const rawPoint of o.points) {
            if (!rawPoint || typeof rawPoint !== "object")
                return null;
            const p = rawPoint as Record<string, unknown>;
            if (!isFiniteNum(p.x) || !isFiniteNum(p.y))
                return null;
            points.push({ x: p.x, y: p.y });
        }
        const result = validateFreeLoop(points);
        if ("error" in result || Math.abs(result.length - o.length) > 0.001)
            return null;
        if (o.gearParts !== undefined && (!Array.isArray(o.gearParts) || o.gearParts.some(i => !Number.isInteger(i) || i < 0)))
            return null;
        return { type: "freeBelt", points: result.points, length: result.length, ...(o.gearParts === undefined ? {} : { gearParts: o.gearParts as number[] }) };
    }
    if (o.type === "gear") {
        if (!isFiniteNum(o.x) || !isFiniteNum(o.y) || !isFiniteNum(o.r))
            return null;
        if (!isFiniteNum(o.drive) || !isFiniteNum(o.angle))
            return null;
        if (o.motorKind !== undefined && o.motorKind !== "motor" && o.motorKind !== "follower")
            return null;
        if (o.speedLevel !== undefined && (!Number.isInteger(o.speedLevel) || (o.speedLevel as number) < 1 || (o.speedLevel as number) > 5))
            return null;
        if (o.motorKind === "follower" && (o.drive !== 0 || o.speedLevel !== undefined))
            return null;
        if (o.frictionContact !== undefined && typeof o.frictionContact !== "boolean")
            return null;
        if (o.motorFrictionContact !== undefined && typeof o.motorFrictionContact !== "boolean")
            return null;
        return { type: "gear", x: o.x, y: o.y, r: o.r, drive: o.drive, angle: o.angle, motorKind: o.motorKind as "motor" | "follower" | undefined, frictionContact: o.frictionContact as boolean | undefined, motorFrictionContact: o.motorFrictionContact as boolean | undefined, speedLevel: o.speedLevel as 1 | 2 | 3 | 4 | 5 | undefined };
    }
    if (o.type === "stroke") {
        if (!Array.isArray(o.points) || o.points.length < 2)
            return null;
        const points: {
            x: number;
            y: number;
        }[] = [];
        for (const pt of o.points) {
            if (!pt || typeof pt !== "object")
                return null;
            const p = pt as Record<string, unknown>;
            if (!isFiniteNum(p.x) || !isFiniteNum(p.y))
                return null;
            points.push({ x: p.x, y: p.y });
        }
        return { type: "stroke", points };
    }
    if (o.type === "belt") {
        if (!isFiniteNum(o.ax) || !isFiniteNum(o.ay) || !isFiniteNum(o.bx) || !isFiniteNum(o.by)) {
            return null;
        }
        return { type: "belt", ax: o.ax, ay: o.ay, bx: o.bx, by: o.by };
    }
    if (o.type === "blower") {
        if (!isFiniteNum(o.x) || !isFiniteNum(o.y) || !isFiniteNum(o.angle))
            return null;
        return { type: "blower", x: o.x, y: o.y, angle: o.angle };
    }
    if (o.type === "gate") {
        if (!isFiniteNum(o.x) || !isFiniteNum(o.y) || !isFiniteNum(o.angle))
            return null;
        if (typeof o.open !== "boolean")
            return null;
        return { type: "gate", x: o.x, y: o.y, angle: o.angle, open: o.open };
    }
    if (o.type === "truckStop") {
        if (!isFiniteNum(o.id) || !isFiniteNum(o.inletX) || !isFiniteNum(o.inletY))
            return null;
        return { type: "truckStop", id: o.id, inletX: o.inletX, inletY: o.inletY };
    }
    return null;
}
export function captureSaveGame(world: World): SaveGame {
    return {
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),
        stageId: world.stage,
        stageState: {},
        placedParts: capturePlacedParts(world),
    };
}
function capturePlacedParts(world: World): PlacedPartSave[] {
    syncFreeBeltContacts(world);
    const parts: PlacedPartSave[] = [];
    const seenBelts = new Set<string>();
    const seenStrokes = new Set<number>();
    for (const b of world.freeBelts ?? []) {
        parts.push({ type: "freeBelt", points: b.points.map(p => ({ ...p })), length: b.length });
    }
    for (const g of world.gears) {
        if (!g.placed || g.spin !== "gear" || g.belt)
            continue;
        parts.push({
            type: "gear",
            x: g.x,
            y: g.y,
            r: g.r,
            drive: g.drive,
            motorKind: g.motorKind,
            frictionContact: g.frictionContact,
            motorFrictionContact: g.motorFrictionContact,
            speedLevel: g.speedLevel,
            angle: g.angle,
        });
    }
    for (const g of world.gears) {
        if (!g.placed || !g.belt || seenBelts.has(g.belt))
            continue;
        const rollers = world.gears.filter((x) => x.placed && x.belt === g.belt);
        if (rollers.length < 2)
            continue;
        seenBelts.add(g.belt);
        const a = rollers[0];
        const b = rollers[1];
        parts.push({ type: "belt", ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
    for (const s of world.segments) {
        if (!s.placed || s.belt || s.stroke === undefined)
            continue;
        if (seenStrokes.has(s.stroke))
            continue;
        seenStrokes.add(s.stroke);
        const pieces = world.segments.filter((x) => x.placed && !x.belt && x.stroke === s.stroke);
        if (pieces.length === 0)
            continue;
        const points: {
            x: number;
            y: number;
        }[] = [{ x: pieces[0].ax, y: pieces[0].ay }];
        for (const piece of pieces) {
            points.push({ x: piece.bx, y: piece.by });
        }
        parts.push({ type: "stroke", points });
    }
    for (const b of world.blowers) {
        if (!b.placed)
            continue;
        parts.push({ type: "blower", x: b.x, y: b.y, angle: b.angle });
    }
    for (const g of world.gates) {
        parts.push({ type: "gate", x: g.x, y: g.y, angle: g.angle, open: g.open });
    }
    for (const s of world.recvTruckStops) {
        parts.push({ type: "truckStop", id: s.id, inletX: s.inletX, inletY: s.inletY });
    }
    const savedGears = world.gears.filter(g => g.placed && g.spin === "gear" && !g.belt);
    for (let i = 0; i < (world.freeBelts ?? []).length; i++) {
        const part = parts[i];
        if (part.type === "freeBelt")
            part.gearParts = (world.freeBelts![i].contacts ?? []).map(c => (world.freeBelts ?? []).length + savedGears.findIndex(g => g.id === c.gearId));
    }
    return parts;
}
export function loadSaveGame(save: SaveGame): World {
    const world = createStage(save.stageId);
    for (const part of save.placedParts) {
        applyPlacedPart(world, part);
    }
    syncFreeBeltContacts(world);
    return world;
}
function applyPlacedPart(world: World, part: PlacedPartSave): void {
    if (part.type === "freeBelt") {
        addFreeBelt(world, part.points);
        return;
    }
    if (part.type === "gear") {
        if (!addPlacedGear(world, part.x, part.y, part.r, part.drive, part.motorKind ? { motorKind: part.motorKind, speedLevel: part.speedLevel, frictionContact: part.frictionContact ?? false, motorFrictionContact: part.motorFrictionContact ?? false } : undefined))
            return;
        const g = world.gears[world.gears.length - 1];
        if (g?.placed)
            g.angle = part.angle;
        return;
    }
    if (part.type === "stroke") {
        addStroke(world, part.points);
        return;
    }
    if (part.type === "belt") {
        addPlacedBelt(world, part.ax, part.ay, part.bx, part.by);
        return;
    }
    if (part.type === "blower") {
        if (!addPlacedBlower(world, part.x, part.y))
            return;
        const b = world.blowers[world.blowers.length - 1];
        if (b?.placed)
            b.angle = part.angle;
        return;
    }
    if (part.type === "gate") {
        if (!addPlacedGate(world, part.x, part.y, part.angle))
            return;
        const g = world.gates[world.gates.length - 1];
        if (g) {
            g.open = part.open;
            g.solid = !part.open;
            g.slide = part.open ? 1 : 0;
            syncGateColliders(world);
        }
        return;
    }
    if (part.type === "truckStop") {
        addRecvTruckStop(world, part.inletX, part.inletY);
    }
}
export function readSlot(index: number): SlotInfo {
    const base: SlotInfo = { index, empty: true, corrupt: false, save: null };
    if (index < 0 || index >= SAVE_SLOT_COUNT)
        return base;
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(slotKey(index));
    }
    catch {
        return { ...base, corrupt: true };
    }
    if (raw == null || raw === "")
        return base;
    try {
        const parsed = parseSaveGame(JSON.parse(raw) as unknown);
        if (!parsed)
            return { ...base, empty: false, corrupt: true };
        return { index, empty: false, corrupt: false, save: parsed };
    }
    catch {
        return { ...base, empty: false, corrupt: true };
    }
}
export function listSlots(): SlotInfo[] {
    const out: SlotInfo[] = [];
    for (let i = 0; i < SAVE_SLOT_COUNT; i++)
        out.push(readSlot(i));
    return out;
}
export function writeSlot(index: number, save: SaveGame): boolean {
    if (index < 0 || index >= SAVE_SLOT_COUNT)
        return false;
    try {
        localStorage.setItem(slotKey(index), JSON.stringify(save));
        return true;
    }
    catch {
        return false;
    }
}
export function clearSlot(index: number): boolean {
    if (index < 0 || index >= SAVE_SLOT_COUNT)
        return false;
    try {
        localStorage.removeItem(slotKey(index));
        return true;
    }
    catch {
        return false;
    }
}
export function createMemoryStore(): {
    slots: (string | null)[];
    read(index: number): SlotInfo;
    write(index: number, save: SaveGame): boolean;
    clear(index: number): boolean;
} {
    const slots: (string | null)[] = Array.from({ length: SAVE_SLOT_COUNT }, () => null);
    return {
        slots,
        read(index: number): SlotInfo {
            const base: SlotInfo = { index, empty: true, corrupt: false, save: null };
            if (index < 0 || index >= SAVE_SLOT_COUNT)
                return base;
            const raw = slots[index];
            if (raw == null || raw === "")
                return base;
            try {
                const parsed = parseSaveGame(JSON.parse(raw) as unknown);
                if (!parsed)
                    return { ...base, empty: false, corrupt: true };
                return { index, empty: false, corrupt: false, save: parsed };
            }
            catch {
                return { ...base, empty: false, corrupt: true };
            }
        },
        write(index: number, save: SaveGame): boolean {
            if (index < 0 || index >= SAVE_SLOT_COUNT)
                return false;
            slots[index] = JSON.stringify(save);
            return true;
        },
        clear(index: number): boolean {
            if (index < 0 || index >= SAVE_SLOT_COUNT)
                return false;
            slots[index] = null;
            return true;
        },
    };
}
