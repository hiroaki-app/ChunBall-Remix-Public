import { MAX_PLACED_GATES, type Gate, type World } from "./model";
export const GATE = {
    len: 108,
    switchGap: 16,
    switchR: 13,
    hitPad: 12,
    slideTime: 0.18,
    openStub: 0.2,
};
export function canPlaceGate(world: World): boolean {
    return world.stage === "free" || world.stage === "sewer" || world.stage === "sandbox";
}
export function gateWall(g: Pick<Gate, "x" | "y" | "angle">): {
    ax: number;
    ay: number;
    bx: number;
    by: number;
} {
    const h = GATE.len * 0.5;
    const c = Math.cos(g.angle);
    const s = Math.sin(g.angle);
    return {
        ax: g.x - c * h,
        ay: g.y - s * h,
        bx: g.x + c * h,
        by: g.y + s * h,
    };
}
export function gateSwitchPos(g: Pick<Gate, "x" | "y" | "angle">): {
    x: number;
    y: number;
} {
    const d = GATE.len * 0.5 + GATE.switchGap;
    return {
        x: g.x + Math.cos(g.angle) * d,
        y: g.y + Math.sin(g.angle) * d,
    };
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
export function gateBlocked(world: World, g: Pick<Gate, "x" | "y" | "angle">, extra = 2): boolean {
    const w = gateWall(g);
    for (const p of world.particles) {
        if (p.standing || p.frozen)
            continue;
        if (distPointToSeg(p.x, p.y, w.ax, w.ay, w.bx, w.by) < p.r + extra)
            return true;
    }
    return false;
}
export function makeGate(id: number, x: number, y: number, angle = 0, open = false): Gate {
    return {
        id,
        x,
        y,
        angle,
        open,
        solid: !open,
        slide: open ? 1 : 0,
    };
}
export function addPlacedGate(world: World, x: number, y: number, angle = 0): boolean {
    if (!canPlaceGate(world))
        return false;
    if (world.gates.length >= MAX_PLACED_GATES)
        return false;
    world.gates.push(makeGate(world.nextId++, x, y, angle, false));
    syncGateColliders(world);
    return true;
}
export function toggleGateOpen(world: World, id: number): void {
    const g = world.gates.find((x) => x.id === id);
    if (!g)
        return;
    g.open = !g.open;
    if (g.open)
        g.solid = false;
}
export function toggleGateAngle(world: World, id: number): void {
    const g = world.gates.find((x) => x.id === id);
    if (!g)
        return;
    g.angle += Math.PI / 4;
    if (g.angle > Math.PI * 2)
        g.angle -= Math.PI * 2;
    syncGateColliders(world);
}
export function hitGateSwitch(world: World, x: number, y: number): Gate | null {
    let best: Gate | null = null;
    let bestD = Infinity;
    for (const g of world.gates) {
        const s = gateSwitchPos(g);
        const d = Math.hypot(s.x - x, s.y - y);
        if (d <= GATE.switchR + 6 && d < bestD) {
            best = g;
            bestD = d;
        }
    }
    return best;
}
export function hitPlacedGate(world: World, x: number, y: number): Gate | null {
    let best: Gate | null = null;
    let bestD = Infinity;
    for (const g of world.gates) {
        const w = gateWall(g);
        const d = distPointToSeg(x, y, w.ax, w.ay, w.bx, w.by);
        if (d <= GATE.hitPad && d < bestD) {
            best = g;
            bestD = d;
        }
    }
    return best;
}
export function removeGate(world: World, id: number): void {
    world.gates = world.gates.filter((g) => g.id !== id);
    syncGateColliders(world);
}
export function syncGateColliders(world: World): void {
    world.segments = world.segments.filter((s) => s.tag !== "placedGate");
    for (const g of world.gates) {
        const w = gateWall(g);
        world.segments.push({
            ax: w.ax,
            ay: w.ay,
            bx: w.bx,
            by: w.by,
            conveyor: 0,
            placed: true,
            draw: false,
            pass: "all",
            tag: "placedGate",
            stroke: g.id,
        });
    }
}
export function updateGates(world: World, dt: number): void {
    if (world.gates.length === 0)
        return;
    let dirty = false;
    for (const g of world.gates) {
        if (g.open) {
            if (g.solid) {
                g.solid = false;
                dirty = true;
            }
        }
        else if (!g.solid) {
            if (!gateBlocked(world, g, 1.5)) {
                g.solid = true;
                dirty = true;
            }
        }
        const target = g.solid ? 0 : 1;
        if (Math.abs(g.slide - target) > 0.001) {
            const step = dt / GATE.slideTime;
            if (g.slide < target)
                g.slide = Math.min(target, g.slide + step);
            else
                g.slide = Math.max(target, g.slide - step);
        }
        else {
            g.slide = target;
        }
    }
    if (dirty)
        syncGateColliders(world);
}
