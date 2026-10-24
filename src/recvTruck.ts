import { SANDBOX_BASKET } from "./sandbox";
import { MAX_RECV_TRUCK_STOPS, type Particle, type RecvTruck, type RecvTruckCargo, type RecvTruckStop, type Segment, type StageId, type World } from "./model";
export type { RecvTruck, RecvTruckStatus, RecvTruckStop } from "./model";
export const RECV_TRUCK = {
    speed: 340,
    approachFrom: 700,
    spawnStagger: 48,
};
const TRUCK_SHAPE = {
    inletHalf: 75,
    hopperBodyL: -64,
    hopperBodyR: 64,
    hopperTopY: 0,
    hopperShoulderY: 10,
    hopperBottomY: 104,
    bedL: -68,
    bedR: 70,
    cabL: -170,
    cabR: -72,
    cabTopY: 40,
    cabBottomY: 154,
    chassisL: -176,
    chassisR: 76,
    chassisY: 160,
    groundY: 208,
    frontWheelX: -137,
    rearWheelX: 28,
    wheelR: 25,
};
export const RECV_TRUCK_STOP_HIT_R = 18;
export function sandboxRecvInletTarget(): {
    x: number;
    y: number;
} {
    return { x: SANDBOX_BASKET.cx, y: 500 };
}
export function stageHasRecvTruck(stage: StageId): boolean {
    return stage === "free" || stage === "sandbox";
}
export function spawnRecvInletX(targetInletX: number, spawnIndex = 0): number {
    return targetInletX - RECV_TRUCK.approachFrom - spawnIndex * RECV_TRUCK.spawnStagger;
}
export function makeRecvTruck(id: number, targetId: number, inletX: number, inletY: number, spawnIndex = 0): RecvTruck {
    return {
        id,
        targetId,
        status: "approaching",
        x: spawnRecvInletX(inletX, spawnIndex),
        y: inletY,
        targetInletX: inletX,
        targetInletY: inletY,
        cargo: [],
    };
}
export type RecvTruckLayout = {
    cx: number;
    cy: number;
    hopL: number;
    hopR: number;
    hopTop: number;
    hopShoulderY: number;
    hopBot: number;
    hopBodyL: number;
    hopBodyR: number;
    bedL: number;
    bedR: number;
    cabL: number;
    cabR: number;
    cabTop: number;
    cabBot: number;
    chassisY: number;
    chassisL: number;
    chassisR: number;
    wheelR: number;
    wheelY: number;
    wheelFrontX: number;
    wheelRearX: number;
    groundY: number;
};
export function recvTruckLayout(inletX: number, inletY: number): RecvTruckLayout {
    const g = TRUCK_SHAPE;
    return {
        cx: inletX,
        cy: inletY,
        hopL: inletX - g.inletHalf,
        hopR: inletX + g.inletHalf,
        hopTop: inletY + g.hopperTopY,
        hopShoulderY: inletY + g.hopperShoulderY,
        hopBot: inletY + g.hopperBottomY,
        hopBodyL: inletX + g.hopperBodyL,
        hopBodyR: inletX + g.hopperBodyR,
        bedL: inletX + g.bedL,
        bedR: inletX + g.bedR,
        cabL: inletX + g.cabL,
        cabR: inletX + g.cabR,
        cabTop: inletY + g.cabTopY,
        cabBot: inletY + g.cabBottomY,
        chassisY: inletY + g.chassisY,
        chassisL: inletX + g.chassisL,
        chassisR: inletX + g.chassisR,
        wheelR: g.wheelR,
        wheelY: inletY + g.groundY - g.wheelR,
        wheelFrontX: inletX + g.frontWheelX,
        wheelRearX: inletX + g.rearWheelX,
        groundY: inletY + g.groundY,
    };
}
export function layoutRecvTruck(t: RecvTruck): RecvTruckLayout {
    return recvTruckLayout(t.x, t.y);
}
function hopperColliderSpecs(lay: RecvTruckLayout): {
    ax: number;
    ay: number;
    bx: number;
    by: number;
}[] {
    return [
        { ax: lay.hopL, ay: lay.hopTop, bx: lay.hopBodyL, by: lay.hopShoulderY },
        { ax: lay.hopR, ay: lay.hopTop, bx: lay.hopBodyR, by: lay.hopShoulderY },
        { ax: lay.hopBodyL, ay: lay.hopShoulderY, bx: lay.hopBodyL, by: lay.hopBot },
        { ax: lay.hopBodyR, ay: lay.hopShoulderY, bx: lay.hopBodyR, by: lay.hopBot },
        { ax: lay.hopBodyL, ay: lay.hopBot, bx: lay.hopBodyR, by: lay.hopBot },
    ];
}
function hopperWallsUp(t: RecvTruck): boolean {
    return t.status === "approaching" || t.status === "waiting";
}
export function recvTruckHopperLive(world: World): boolean {
    return world.recvTrucks.some(hopperWallsUp);
}
export function recvTruckBySegment(world: World, s: Segment): RecvTruck | undefined {
    if (s.tag !== "recvTruck")
        return undefined;
    return world.recvTrucks.find((t) => t.id === s.stroke);
}
export function syncRecvTruckColliders(world: World): void {
    world.segments = world.segments.filter((s) => s.tag !== "recvTruck");
    for (const t of world.recvTrucks) {
        if (!hopperWallsUp(t))
            continue;
        const lay = layoutRecvTruck(t);
        for (const spec of hopperColliderSpecs(lay)) {
            world.segments.push({
                ax: spec.ax,
                ay: spec.ay,
                bx: spec.bx,
                by: spec.by,
                conveyor: 0,
                placed: false,
                draw: false,
                pass: "all",
                tag: "recvTruck",
                stroke: t.id,
            });
        }
    }
}
export function stagePlacesRecvTruckStops(stage: StageId): boolean {
    return stage === "free" || stage === "sandbox";
}
export function addRecvTruckStop(world: World, inletX: number, inletY: number): RecvTruckStop | null {
    if (!stagePlacesRecvTruckStops(world.stage))
        return null;
    if (world.recvTruckStops.length >= MAX_RECV_TRUCK_STOPS)
        return null;
    const stop: RecvTruckStop = {
        id: world.nextId++,
        inletX,
        inletY,
    };
    world.recvTruckStops.push(stop);
    return stop;
}
export function setRecvTruckStopInlet(world: World, id: number, inletX: number, inletY: number): void {
    const stop = world.recvTruckStops.find((s) => s.id === id);
    if (!stop)
        return;
    stop.inletX = inletX;
    stop.inletY = inletY;
    for (const t of world.recvTrucks) {
        if (t.targetId !== id)
            continue;
        t.targetInletX = inletX;
        t.targetInletY = inletY;
        t.y = inletY;
        if (t.status === "waiting")
            t.x = inletX;
    }
    syncRecvTruckColliders(world);
}
export function removeRecvTruckStop(world: World, id: number): void {
    const stop = world.recvTruckStops.find((s) => s.id === id);
    if (!stop)
        return;
    for (const t of world.recvTrucks) {
        if (t.targetId !== id)
            continue;
        if (t.status === "approaching" || t.status === "waiting")
            beginDepart(world, t);
    }
    world.recvTruckStops = world.recvTruckStops.filter((s) => s.id !== id);
}
export function hitRecvTruckStop(world: World, x: number, y: number): RecvTruckStop | null {
    let best: RecvTruckStop | null = null;
    let bestD = Infinity;
    for (const s of world.recvTruckStops) {
        const d = Math.hypot(s.inletX - x, s.inletY - y);
        if (d <= RECV_TRUCK_STOP_HIT_R && d < bestD) {
            best = s;
            bestD = d;
        }
    }
    return best;
}
function toggleFixedRecvTruck(world: World, dest: {
    x: number;
    y: number;
}): void {
    const fixed = world.recvTrucks.filter((t) => t.targetId < 0);
    if (fixed.length === 0) {
        world.recvTrucks.push(makeRecvTruck(world.nextId++, -1, dest.x, dest.y, 0));
        syncRecvTruckColliders(world);
        return;
    }
    for (const t of fixed) {
        if (t.status === "waiting")
            beginDepart(world, t);
    }
}
function toggleFleetRecvTruck(world: World, fixed: {
    x: number;
    y: number;
} | null): void {
    if (world.recvTrucks.length > 0) {
        for (const t of world.recvTrucks) {
            if (t.status === "approaching" || t.status === "waiting")
                beginDepart(world, t);
        }
        return;
    }
    if (fixed)
        world.recvTrucks.push(makeRecvTruck(world.nextId++, -1, fixed.x, fixed.y, 0));
    for (let i = 0; i < world.recvTruckStops.length; i++) {
        const stop = world.recvTruckStops[i];
        world.recvTrucks.push(makeRecvTruck(world.nextId++, stop.id, stop.inletX, stop.inletY, fixed ? i + 1 : i));
    }
    syncRecvTruckColliders(world);
}
export function toggleRecvTruck(world: World): void {
    if (world.stage === "sandbox") {
        toggleFleetRecvTruck(world, world.recvTruckStops.length === 0 ? sandboxRecvInletTarget() : null);
        return;
    }
    if (world.stage !== "free")
        return;
    toggleFleetRecvTruck(world, null);
}
function inInstanceHopper(t: RecvTruck, p: Particle, pad: number): boolean {
    if (t.status === "departing") {
        for (let i = 0; i < t.cargo.length; i++) {
            if (t.cargo[i].id === p.id)
                return true;
        }
        return false;
    }
    if (!hopperWallsUp(t))
        return false;
    const lay = layoutRecvTruck(t);
    return (p.x > lay.hopL - pad &&
        p.x < lay.hopR + pad &&
        p.y > lay.hopTop - 10 &&
        p.y < lay.hopBot + p.r + 6);
}
export function isRecvTruckCargo(world: World, p: Particle): boolean {
    for (const t of world.recvTrucks) {
        if (t.status !== "departing")
            continue;
        for (let i = 0; i < t.cargo.length; i++) {
            if (t.cargo[i].id === p.id)
                return true;
        }
    }
    return false;
}
export function inRecvTruckHopper(world: World, p: Particle, pad = 2): boolean {
    for (const t of world.recvTrucks) {
        if (inInstanceHopper(t, p, pad))
            return true;
    }
    return false;
}
export function applyRecvTruckCargo(world: World): void {
    const byId = new Map<number, Particle>();
    for (const p of world.particles)
        byId.set(p.id, p);
    for (const t of world.recvTrucks) {
        if (t.status !== "departing" || t.cargo.length === 0)
            continue;
        for (const c of t.cargo) {
            const p = byId.get(c.id);
            if (!p)
                continue;
            p.x = t.x + c.lx;
            p.y = t.y + c.ly;
            p.vx = 0;
            p.vy = 0;
        }
    }
}
export function updateRecvTruck(world: World, dt: number): void {
    if (!stageHasRecvTruck(world.stage))
        return;
    const finished: RecvTruck[] = [];
    for (const t of world.recvTrucks) {
        t.y = t.targetInletY;
        if (t.status === "approaching") {
            const target = t.targetInletX;
            const dist = target - t.x;
            if (dist <= 0.7) {
                t.x = target;
                t.status = "waiting";
            }
            else {
                const speed = Math.min(RECV_TRUCK.speed, 70 + dist * 1.2);
                t.x += speed * dt;
                if (t.x >= target) {
                    t.x = target;
                    t.status = "waiting";
                }
            }
        }
        else if (t.status === "departing") {
            const idx = Math.max(0, world.recvTruckStops.findIndex((s) => s.id === t.targetId));
            const target = spawnRecvInletX(t.targetInletX, t.targetId < 0 ? 0 : idx);
            const dist = t.x - target;
            if (dist <= 0.7) {
                t.x = target;
                finished.push(t);
                continue;
            }
            const speed = Math.min(RECV_TRUCK.speed, 70 + dist * 1.2);
            t.x -= speed * dt;
            if (t.x <= target)
                t.x = target;
            applyRecvTruckCargo(world);
            const lay = layoutRecvTruck(t);
            if (lay.chassisR < 0) {
                finished.push(t);
                continue;
            }
        }
    }
    for (const t of finished)
        finishDepart(world, t);
    syncRecvTruckColliders(world);
}
function beginDepart(world: World, t: RecvTruck): void {
    const claimed = new Set<number>();
    for (const other of world.recvTrucks) {
        if (other === t || other.status !== "departing")
            continue;
        for (const c of other.cargo)
            claimed.add(c.id);
    }
    const cargo: RecvTruckCargo[] = [];
    for (const p of world.particles) {
        if (p.standing)
            continue;
        if (p.kind !== "grain" && p.kind !== "other")
            continue;
        if (claimed.has(p.id))
            continue;
        if (!inInstanceHopper(t, p, 4))
            continue;
        cargo.push({ id: p.id, lx: p.x - t.x, ly: p.y - t.y });
        claimed.add(p.id);
        p.vx = 0;
        p.vy = 0;
        p.sleeping = true;
        p.sleepTime = 0;
    }
    t.cargo = cargo;
    t.status = "departing";
}
function finishDepart(world: World, t: RecvTruck): void {
    const ids = new Set(t.cargo.map((c) => c.id));
    if (ids.size > 0) {
        world.particles = world.particles.filter((p) => {
            if (!ids.has(p.id))
                return true;
            const keep = p.marked;
            if (keep) {
                p.sleeping = false;
                p.sleepTime = 0;
            }
            return keep;
        });
    }
    world.recvTrucks = world.recvTrucks.filter((x) => x.id !== t.id);
}
