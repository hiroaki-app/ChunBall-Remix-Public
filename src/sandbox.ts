import { GRAIN_R, type Particle, type World } from "./model";
import { pickBallColor } from "./ballLook";
export const SANDBOX_BALL_COUNT = 64;
export const SANDBOX_REFILL_DELAY = 0.75;
export const SANDBOX_BASKET = {
    cx: 640,
    mouthY: 70,
    mouthRx: 108,
    mouthRy: 8,
    leftRim: { x: 532, y: 70 },
    rightRim: { x: 748, y: 70 },
    leftCtrl: { x: 508, y: 124 },
    rightCtrl: { x: 772, y: 124 },
    bottomL: { x: 576, y: 170 },
    bottomR: { x: 704, y: 170 },
    bottomY: 186,
};
const PACK_GAP = GRAIN_R * 2 + 1.6;
const PACK_ROW_H = GRAIN_R * 2 + 1.2;
const PACK_ROWS = [6, 7, 8, 8, 8, 9, 9, 9] as const;
function idleRotator() {
    return { x: -200, y: -200, r: 8, collideR: 0, angle: 0, omega: 0 };
}
function ball(world: World, x: number, y: number): Particle {
    const id = world.nextId++;
    return {
        id,
        kind: "grain",
        x,
        y,
        vx: 0,
        vy: 0,
        r: GRAIN_R,
        frozen: false,
        sleeping: true,
        sleepTime: 0,
        standing: false,
        stem: 0,
        angle: 0,
        marked: false,
        color: pickBallColor(id),
        trackId: null,
    };
}
export function sandboxBallLayout(): {
    x: number;
    y: number;
}[] {
    const rows = PACK_ROWS.length;
    const bottomY = SANDBOX_BASKET.bottomY - GRAIN_R - 14;
    const points: {
        x: number;
        y: number;
    }[] = [];
    for (let row = 0; row < rows; row++) {
        const n = PACK_ROWS[row];
        const y = bottomY - (rows - 1 - row) * PACK_ROW_H;
        const span = (n - 1) * PACK_GAP;
        const x0 = SANDBOX_BASKET.cx - span / 2;
        for (let col = 0; col < n; col++) {
            points.push({ x: x0 + col * PACK_GAP, y });
        }
    }
    return points;
}
export function createSandboxWorld(): World {
    const world: World = {
        stage: "sandbox",
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
        sandbox: { released: false, refillWait: 0 },
    };
    fillBasket(world);
    return world;
}
function fillBasket(world: World): void {
    if (world.particles.length > 0)
        return;
    const layout = sandboxBallLayout();
    if (layout.length !== SANDBOX_BALL_COUNT) {
        throw new Error(`sandbox layout ${layout.length} !== ${SANDBOX_BALL_COUNT}`);
    }
    for (const p of layout)
        world.particles.push(ball(world, p.x, p.y));
}
export function releaseSandboxBasket(world: World): void {
    if (world.stage !== "sandbox" || !world.sandbox || world.sandbox.released)
        return;
    world.sandbox.released = true;
    world.sandbox.refillWait = 0;
    for (const p of world.particles) {
        if (!p.sleeping)
            continue;
        p.sleeping = false;
        p.sleepTime = 0;
    }
}
export function updateSandbox(world: World, dt: number): void {
    const state = world.sandbox;
    if (!state || world.stage !== "sandbox")
        return;
    if (!state.released || world.particles.length > 0) {
        state.refillWait = 0;
        return;
    }
    state.refillWait += dt;
    if (state.refillWait < SANDBOX_REFILL_DELAY)
        return;
    state.released = false;
    state.refillWait = 0;
    fillBasket(world);
}
