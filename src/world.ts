import { syncFreeBeltContacts } from "./freeBelt";
import { BLOWER_CONE, BLOWER_FORCE, BLOWER_RANGE, GEAR_BASE_OMEGA, GEAR_PLACE_R, GRAIN_R, H, MAX_PLACED_GEARS, MAX_PLACED_SEGS, MIN_PLACED_BELT_LEN, PLACED_BELT_R, W, type Blower, type EraserHit, type Gear, type Particle, type Segment, type StageId, type World } from "./model";
import { BALL_COLORS, pickBallColor } from "./ballLook";
import { makeBlower } from "./blower";
import { createSewerWorld } from "./sewer";
import { createFreeWorld } from "./free";
import { createSandboxWorld } from "./sandbox";
import { createWashWorld } from "./wash";
import { removeRecvTruckStop, RECV_TRUCK_STOP_HIT_R } from "./recvTruck";
import { GATE, gateSwitchPos, gateWall, removeGate } from "./gate";
function nid(world: World): number {
    return world.nextId++;
}
function seg(ax: number, ay: number, bx: number, by: number, conveyor = 0, placed = false, draw?: boolean, pass: Segment["pass"] = "all", tag?: Segment["tag"], belt?: string): Segment {
    return {
        ax,
        ay,
        bx,
        by,
        conveyor,
        placed,
        draw: draw ?? placed,
        pass,
        tag,
        belt,
    };
}
export function createWorld(): World {
    return createFreeWorld();
}
export function createStage(stage: StageId): World {
    if (stage === "sewer")
        return createSewerWorld();
    if (stage === "free")
        return createFreeWorld();
    if (stage === "sandbox")
        return createSandboxWorld();
    if (stage === "wash")
        return createWashWorld();
    throw new Error("Unsupported stage");
}
export function placedGearDrive(r: number, sign = 1, level: 1 | 2 | 3 | 4 | 5 = 3): number {
    const factor = r <= 22 ? 2.0 : r <= 34 ? 1.5 : 1.0;
    return Math.sign(sign || 1) * GEAR_BASE_OMEGA * factor * Math.max(10, r) * [0.25, 0.5, 1, 1.5, 2][level - 1];
}
export function addPlacedGear(world: World, x: number, y: number, r = GEAR_PLACE_R, drive = placedGearDrive(r), settings?: {
    motorKind: "motor" | "follower";
    speedLevel?: 1 | 2 | 3 | 4 | 5;
    frictionContact?: boolean;
    motorFrictionContact?: boolean;
}): boolean {
    if (world.gears.filter((g) => g.placed).length >= MAX_PLACED_GEARS)
        return false;
    for (const g of world.gears) {
        if (g.spin !== "gear")
            continue;
        if (Math.hypot(g.x - x, g.y - y) < 8)
            return false;
    }
    world.gears.push({
        ...settings,
        frictionContact: settings?.frictionContact ?? (settings?.motorKind !== undefined),
        motorFrictionContact: settings?.motorFrictionContact ?? (settings?.motorKind === "motor" ? true : undefined),
        id: nid(world),
        x,
        y,
        r,
        angle: Math.random() * Math.PI,
        omega: 0,
        drive: settings?.motorKind === "follower" ? 0 : drive,
        drivePriority: 1,
        driveSeq: world.nextId++,
        placed: true,
        spin: "gear",
    });
    syncFreeBeltContacts(world);
    return true;
}
export function togglePlacedGearDrive(world: World, id: number): boolean {
    const g = world.gears.find((x) => x.id === id && x.placed);
    if (!g || g.drive === 0)
        return false;
    g.drive = -g.drive;
    g.driveSeq = world.nextId++;
    return true;
}
export function removeGear(world: World, id: number): void {
    world.gears = world.gears.filter((g) => g.id !== id);
    syncFreeBeltContacts(world);
}
function distPointToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    const t = ab2 < 1e-8 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}
export function collectEraserHits(world: World, x: number, y: number, r: number): EraserHit[] {
    const hits: EraserHit[] = [];
    const seenStroke = new Set<number>();
    const seenBelt = new Set<string>();
    for (const g of world.gears) {
        if (!g.placed)
            continue;
        if (Math.hypot(g.x - x, g.y - y) > g.r + r)
            continue;
        if (g.belt) {
            if (!seenBelt.has(g.belt)) {
                seenBelt.add(g.belt);
                hits.push({ kind: "belt", id: g.belt });
            }
        }
        else {
            hits.push({ kind: "gear", id: g.id });
        }
    }
    for (const b of world.blowers) {
        if (!b.placed)
            continue;
        if (Math.hypot(b.x - x, b.y - y) > 22 + r)
            continue;
        hits.push({ kind: "blower", id: b.id });
    }
    for (const g of world.gates) {
        const w = gateWall(g);
        const sw = gateSwitchPos(g);
        const onWall = distPointToSeg(x, y, w.ax, w.ay, w.bx, w.by) <= r + 3;
        const onSwitch = Math.hypot(sw.x - x, sw.y - y) <= GATE.switchR + r;
        if (onWall || onSwitch)
            hits.push({ kind: "gate", id: g.id });
    }
    for (const s of world.recvTruckStops) {
        if (Math.hypot(s.inletX - x, s.inletY - y) <= RECV_TRUCK_STOP_HIT_R + r) {
            hits.push({ kind: "truckStop", id: s.id });
        }
    }
    for (const s of world.segments) {
        if (!s.placed)
            continue;
        if (s.tag === "placedGate")
            continue;
        if (distPointToSeg(x, y, s.ax, s.ay, s.bx, s.by) > r + 3)
            continue;
        if (s.freeBelt !== undefined) {
            if (!hits.some(h => h.kind === "freeBelt" && h.id === s.freeBelt))
                hits.push({ kind: "freeBelt", id: s.freeBelt });
            continue;
        }
        if (s.belt) {
            if (!seenBelt.has(s.belt)) {
                seenBelt.add(s.belt);
                hits.push({ kind: "belt", id: s.belt });
            }
            continue;
        }
        const strokeId = s.stroke;
        if (strokeId === undefined)
            continue;
        if (seenStroke.has(strokeId))
            continue;
        seenStroke.add(strokeId);
        hits.push({ kind: "stroke", id: strokeId });
    }
    return hits;
}
export function applyEraser(world: World, hits: EraserHit[]): void {
    if (!hits.length)
        return;
    const gears = new Set<number>();
    const strokes = new Set<number>();
    const belts = new Set<string>();
    const freeBelts = new Set<number>();
    const blowers = new Set<number>();
    const gates = new Set<number>();
    const truckStops = new Set<number>();
    for (const h of hits) {
        if (h.kind === "gear")
            gears.add(h.id);
        else if (h.kind === "stroke")
            strokes.add(h.id);
        else if (h.kind === "belt")
            belts.add(h.id);
        else if (h.kind === "freeBelt")
            freeBelts.add(h.id);
        else if (h.kind === "gate")
            gates.add(h.id);
        else if (h.kind === "truckStop")
            truckStops.add(h.id);
        else
            blowers.add(h.id);
    }
    if (belts.size) {
        world.belts = world.belts.filter((b) => !belts.has(b.id));
        world.gears = world.gears.filter((g) => !g.belt || !belts.has(g.belt));
        world.segments = world.segments.filter((s) => !s.belt || !belts.has(s.belt));
    }
    if (freeBelts.size) {
        world.freeBelts = (world.freeBelts ?? []).filter(b => !freeBelts.has(b.id));
        world.segments = world.segments.filter(s => s.freeBelt === undefined || !freeBelts.has(s.freeBelt));
    }
    if (gears.size) {
        world.gears = world.gears.filter((g) => !g.placed || !gears.has(g.id));
    }
    if (blowers.size) {
        world.blowers = world.blowers.filter((b) => !blowers.has(b.id));
    }
    if (gates.size) {
        for (const id of gates)
            removeGate(world, id);
    }
    if (truckStops.size) {
        for (const id of truckStops)
            removeRecvTruckStop(world, id);
    }
    if (strokes.size) {
        world.segments = world.segments.filter((s) => {
            if (!s.placed || s.belt || s.tag === "placedGate")
                return true;
            return s.stroke === undefined || !strokes.has(s.stroke);
        });
    }
    syncFreeBeltContacts(world);
}
export function addStroke(world: World, points: {
    x: number;
    y: number;
}[]): void {
    if (points.length < 2)
        return;
    const placed = world.segments.filter((s) => s.placed).length;
    const stroke = nid(world);
    for (let i = 1; i < points.length; i++) {
        if (placed + i - 1 >= MAX_PLACED_SEGS)
            break;
        const a = points[i - 1];
        const b = points[i];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 4)
            continue;
        const piece = seg(a.x, a.y, b.x, b.y, 0, true);
        piece.stroke = stroke;
        world.segments.push(piece);
    }
}
function pushBeltArc(s: Segment[], cx: number, cy: number, r: number, a0: number, a1: number, n: number, belt: string): void {
    for (let i = 0; i < n; i++) {
        const t0 = a0 + (i / n) * (a1 - a0);
        const t1 = a0 + ((i + 1) / n) * (a1 - a0);
        s.push(seg(cx + Math.cos(t0) * r, cy + Math.sin(t0) * r, cx + Math.cos(t1) * r, cy + Math.sin(t1) * r, 0, true, false, "all", undefined, belt));
    }
}
export function addPlacedBelt(world: World, ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < MIN_PLACED_BELT_LEN)
        return false;
    if (world.segments.filter((s) => s.placed).length + 16 >= MAX_PLACED_SEGS)
        return false;
    if (world.gears.filter((g) => g.placed).length + 2 >= MAX_PLACED_GEARS)
        return false;
    const r = PLACED_BELT_R;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const beltId = `b${nid(world)}`;
    world.belts.push({ id: beltId, speed: 0, travel: 0, outerR: r });
    for (const [x, y] of [
        [ax, ay],
        [bx, by],
    ] as const) {
        world.gears.push({
            id: nid(world),
            x,
            y,
            r,
            angle: 0,
            omega: 0,
            drive: 0,
            drivePriority: 0,
            driveSeq: 0,
            placed: true,
            spin: "roller",
            belt: beltId,
        });
    }
    const aTx = ax + nx * r;
    const aTy = ay + ny * r;
    const bTx = bx + nx * r;
    const bTy = by + ny * r;
    const aBx = ax - nx * r;
    const aBy = ay - ny * r;
    const bBx = bx - nx * r;
    const bBy = by - ny * r;
    world.segments.push(seg(aTx, aTy, bTx, bTy, 0, true, false, "all", undefined, beltId));
    const ang = Math.atan2(uy, ux);
    pushBeltArc(world.segments, bx, by, r, ang + Math.PI / 2, ang - Math.PI / 2, 5, beltId);
    world.segments.push(seg(bBx, bBy, aBx, aBy, 0, true, false, "all", undefined, beltId));
    pushBeltArc(world.segments, ax, ay, r, ang - Math.PI / 2, ang - Math.PI / 2 - Math.PI, 5, beltId);
    return true;
}
export function addPlacedBlower(world: World, x: number, y: number): boolean {
    if (world.blowers.filter((b) => b.placed).length >= 12)
        return false;
    world.blowers.push(makeBlower(nid(world), x, y, {
        placed: true,
        mode: "planar",
        angle: -Math.PI / 2,
        range: BLOWER_RANGE,
        force: BLOWER_FORCE,
        cone: BLOWER_CONE,
    }));
    return true;
}
export function togglePlacedBlowerAngle(world: World, id: number): void {
    const b = world.blowers.find((x) => x.id === id && x.placed);
    if (!b)
        return;
    b.angle += Math.PI / 4;
    if (b.angle > Math.PI * 2)
        b.angle -= Math.PI * 2;
}
export function hitPlacedBlower(world: World, x: number, y: number): Blower | null {
    let best: Blower | null = null;
    let bestD = Infinity;
    for (const b of world.blowers) {
        if (!b.placed)
            continue;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d <= 28 && d < bestD) {
            best = b;
            bestD = d;
        }
    }
    return best;
}
export function removeBlower(world: World, id: number): void {
    world.blowers = world.blowers.filter((b) => b.id !== id);
}
