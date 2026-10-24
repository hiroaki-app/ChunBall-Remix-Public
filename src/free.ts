import { GRAIN_R, type Particle, type Segment, type World } from "./model";
import { pickBallColor } from "./ballLook";
export const FL = {
    spawn: { x: 90, y: 72 },
    hopper: {
        top: { x0: 32, x1: 148, y: 40 },
        left: [
            { x: 32, y: 40 },
            { x: 32, y: 118 },
            { x: 70, y: 162 },
        ],
        right: [
            { x: 148, y: 40 },
            { x: 148, y: 104 },
            { x: 116, y: 162 },
        ],
    },
    ramps: [
        { ax: 56, ay: 168, bx: 500, by: 292 },
        { ax: 430, ay: 338, bx: 860, by: 455 },
        { ax: 800, ay: 500, bx: 1080, by: 590 },
    ],
    dish: {
        left: [
            { x: 930, y: 548 },
            { x: 948, y: 642 },
            { x: 1008, y: 678 },
        ],
        floor: { x0: 1008, y: 678, x1: 1136 },
        right: [
            { x: 1136, y: 678 },
            { x: 1164, y: 628 },
            { x: 1172, y: 548 },
        ],
    },
};
export const FREE_BALL_CAP = 50;
function nid(world: World): number {
    return world.nextId++;
}
function seg(ax: number, ay: number, bx: number, by: number, conveyor = 0): Segment {
    return { ax, ay, bx, by, conveyor, placed: false, draw: false, pass: "all" };
}
function ball(world: World, kind: Particle["kind"], x: number, y: number, extra: Partial<Particle> = {}): Particle {
    const id = nid(world);
    return {
        id,
        kind,
        x,
        y,
        vx: extra.vx ?? 0,
        vy: extra.vy ?? 0,
        r: GRAIN_R,
        frozen: extra.frozen ?? false,
        sleeping: false,
        sleepTime: 0,
        standing: false,
        stem: 0,
        angle: 0,
        marked: extra.marked ?? false,
        color: extra.color ?? pickBallColor(id),
        trackId: extra.trackId ?? null,
    };
}
function idleRotator() {
    return { x: -200, y: -200, r: 8, collideR: 0, angle: 0, omega: 0 };
}
function poly(s: Segment[], pts: {
    x: number;
    y: number;
}[]): void {
    for (let i = 1; i < pts.length; i++) {
        s.push(seg(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
    }
}
export function createFreeWorld(): World {
    const world: World = {
        stage: "free",
        nextId: 1,
        segments: [],
        gears: [],
        particles: [],
        zones: [],
        drum: idleRotator(),
        blowers: [],
        gates: [],
        spawnAcc: 0,
        time: 0,
        recvTrucks: [],
        recvTruckStops: [],
        belts: [],
    };
    const s: Segment[] = [];
    const h = FL.hopper;
    s.push(seg(h.top.x0, h.top.y, h.top.x1, h.top.y));
    poly(s, h.left);
    poly(s, h.right);
    for (const r of FL.ramps)
        s.push(seg(r.ax, r.ay, r.bx, r.by, 90));
    poly(s, FL.dish.left);
    s.push(seg(FL.dish.floor.x0, FL.dish.floor.y, FL.dish.floor.x1, FL.dish.floor.y));
    poly(s, FL.dish.right);
    world.segments = s;
    world.particles.push(ball(world, "grain", FL.spawn.x, FL.spawn.y, { vx: 22, vy: 36 }));
    const start: [
        number,
        number,
        number
    ][] = [
        [160, 198, 70],
        [280, 232, 80],
        [400, 264, 85],
    ];
    for (const [x, y, vx] of start) {
        world.particles.push(ball(world, "grain", x, y, { vx, vy: 10 }));
    }
    return world;
}
export function spawnFreeBall(world: World): void {
    if (world.stage !== "free")
        return;
    const balls = world.particles.filter((p) => p.kind === "grain");
    if (balls.length >= FREE_BALL_CAP)
        return;
    world.particles.push(ball(world, "grain", FL.spawn.x, FL.spawn.y, {
        vx: 16 + Math.random() * 14,
        vy: 28 + Math.random() * 18,
    }));
}
