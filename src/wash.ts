import { pickBallColor } from "./ballLook";
import { GRAIN_R, type Gear, type Particle, type Segment, type World } from "./model";
import { spinsMesh } from "./spin";
export const WASH_LAYOUT = {
    cabinet: { x: 300, y: 228, w: 620, h: 470 },
    hinge: { x: 392, y: 246 },
    lidLength: 276,
    openAngle: -0.72,
    clickAngle: 0.05,
    tub: { left: 392, right: 668, top: 270, bottom: 508, cx: 530 },
    pulsator: { x: 530, y: 496, rx: 76, ry: 7 },
    roomTop: 528,
    shaft: { x: 530, y0: 508, y1: 558 },
    motor: { x: 760, y: 632, r: 26 },
    gears: [
        { x: 828, y: 632, r: 20 },
        { x: 854, y: 611, r: 16 },
    ],
    power: { x: 730, y: 318, w: 130, h: 44 },
    drop: { x: 730, y: 372, w: 130, h: 44 },
    status: { x: 730, y: 252, w: 130, h: 52 },
    drain: { x0: 482, x1: 578, y: 508 },
    exit: { mouth: 44, lip: 56 },
    inlet: { x: 530, y: 284 },
};
export const WASH_BALL_COUNT = 18;
export const WASH_BASKET = {
    cx: 530,
    mouthY: 292,
    mouthRx: 52,
    mouthRy: 6,
    leftRim: { x: 478, y: 292 },
    rightRim: { x: 582, y: 292 },
    leftCtrl: { x: 468, y: 330 },
    rightCtrl: { x: 592, y: 330 },
    bottomL: { x: 498, y: 358 },
    bottomR: { x: 562, y: 358 },
    bottomY: 368,
};
const BASKET_HOLD = 0.55;
const PACK_GAP = GRAIN_R * 2 + 1.6;
const PACK_ROW_H = GRAIN_R * 2 + 1.2;
const PACK_ROWS = [3, 4, 5, 6] as const;
const CLOSE_TIME = 0.72;
const CLICK_TIME = 0.1;
const OPEN_TIME = 0.55;
const STOP_OMEGA = 0.12;
const STOP_HOLD = 0.12;
const WASH_OMEGA = 3.8;
const WASH_FLIP = 2.4;
const SPIN_TUB = 14;
const SPIN_PULSATOR = 10;
export const WASH_SAW_PHASE = 0.78;
const PHASE_TIME = {
    fill1: 2.2,
    wash: 8,
    drain1: 3.2,
    fill2: 2.2,
    rinse1: 5,
    drain2: 3.2,
    fill3: 2.2,
    rinse2: 5,
    drain3: 3.2,
    spin: 6,
} as const;
export type WashPhase = keyof typeof PHASE_TIME;
export type WashLid = "open" | "closing" | "click" | "closed" | "opening";
const NEXT: Record<WashPhase, WashPhase | "end"> = {
    fill1: "wash",
    wash: "drain1",
    drain1: "fill2",
    fill2: "rinse1",
    rinse1: "drain2",
    drain2: "fill3",
    fill3: "rinse2",
    rinse2: "drain3",
    drain3: "spin",
    spin: "end",
};
const WATER = ["#8fd8ff", "#a8e4ff", "#7ecff8", "#c5eeff", "#6ec6f2"];
type PourKind = "water" | "detergent";
const WASH_BALL_CAP = 72;
const DIRT_R = 3.1;
const DIRT_COLORS = ["#8d5a32", "#a56b3a", "#6f4328", "#c4894c", "#7a4e2e"];
export type WashLaundryKind = "shirt" | "sock" | "towel";
export type WashDirt = {
    ox: number;
    oy: number;
    stick: number;
    color: string;
};
export type WashLaundry = {
    kind: WashLaundryKind;
    homeX: number;
    homeY: number;
    rest: number;
    phase: number;
    x: number;
    y: number;
    angle: number;
    dirt: WashDirt[];
};
export type WashState = {
    power: boolean;
    ending: boolean;
    finished: boolean;
    queuedDrops: PourKind[];
    activeDrop: PourKind | null;
    basketHold: number;
    phase: WashPhase;
    phaseLeft: number;
    lid: WashLid;
    lidT: number;
    lidFrom: number;
    lidAngle: number;
    pulsatorAngle: number;
    pulsatorOmega: number;
    tubAngle: number;
    tubOmega: number;
    motorAngle: number;
    motorOmega: number;
    agitateT: number;
    stopHold: number;
    laundry: WashLaundry[];
    portId: number;
    sawId: number;
    coupled: boolean;
    sawJoined: boolean;
    motion: "stir" | "fill" | "spin" | "coast";
    shaftTarget: number;
};
type Plug = {
    seg: Segment;
    ax: number;
    ay: number;
    bx: number;
    by: number;
};
type WashParts = {
    drain: Plug;
    exitL: Plug;
    exitR: Plug;
    floorL: Plug;
    floorR: Plug;
};
const parts = new WeakMap<World, WashParts>();
function idleRotator() {
    return { x: -200, y: -200, r: 8, collideR: 0, angle: 0, omega: 0 };
}
function seg(ax: number, ay: number, bx: number, by: number, tag?: Segment["tag"]): Segment {
    return { ax, ay, bx, by, conveyor: 0, placed: false, draw: false, pass: "all", tag };
}
function plug(ax: number, ay: number, bx: number, by: number, tag?: Segment["tag"]): Plug {
    return { seg: seg(ax, ay, bx, by, tag), ax, ay, bx, by };
}
function approach(omega: number, target: number, dt: number): number {
    return omega + (target - omega) * (1 - Math.exp(-5.5 * dt));
}
function closingAngle(from: number, u: number): number {
    const e = u * u * (3 - 2 * u);
    return from * (1 - e);
}
function openingAngle(from: number, u: number): number {
    const open = WASH_LAYOUT.openAngle;
    const past = open * 1.16;
    const popEnd = 0.32;
    if (u <= popEnd) {
        const e = 1 - (1 - u / popEnd) ** 3;
        return from + (past - from) * e;
    }
    const w = (u - popEnd) / (1 - popEnd);
    return open + (past - open) * Math.exp(-3.6 * w) * Math.cos(w * Math.PI * 3);
}
function beginClose(state: WashState): void {
    state.lid = "closing";
    state.lidT = 0;
    state.lidFrom = state.lidAngle;
}
function beginOpen(state: WashState): void {
    state.lid = "opening";
    state.lidT = 0;
    state.lidFrom = state.lidAngle;
    state.stopHold = 0;
}
function stepLid(state: WashState, dt: number): void {
    if (state.lid === "closing") {
        state.lidT += dt;
        const u = Math.min(1, state.lidT / CLOSE_TIME);
        state.lidAngle = closingAngle(state.lidFrom, u);
        if (u >= 1) {
            state.lid = "click";
            state.lidT = 0;
            state.lidAngle = 0;
        }
        return;
    }
    if (state.lid === "click") {
        state.lidT += dt;
        const u = Math.min(1, state.lidT / CLICK_TIME);
        state.lidAngle = Math.sin(u * Math.PI) * WASH_LAYOUT.clickAngle;
        if (u >= 1) {
            state.lid = "closed";
            state.lidAngle = 0;
        }
        return;
    }
    if (state.lid === "opening") {
        state.lidT += dt;
        const u = Math.min(1, state.lidT / OPEN_TIME);
        state.lidAngle = openingAngle(state.lidFrom, u);
        if (u >= 1) {
            state.lid = "open";
            state.lidAngle = WASH_LAYOUT.openAngle;
        }
    }
}
function isDrain(phase: WashPhase): boolean {
    return phase === "drain1" || phase === "drain2" || phase === "drain3";
}
function isFill(phase: WashPhase): boolean {
    return phase === "fill1" || phase === "fill2" || phase === "fill3";
}
function isStir(phase: WashPhase): boolean {
    return phase === "wash" || phase === "rinse1" || phase === "rinse2";
}
export function washPhaseLabel(state: WashState): string {
    if (state.finished)
        return "終了";
    if (!state.power && state.lid === "open")
        return "停止";
    if (state.ending)
        return "停止中";
    if (isFill(state.phase))
        return "給水";
    if (state.phase === "wash")
        return "洗い";
    if (isDrain(state.phase))
        return "排水";
    if (state.phase === "rinse1")
        return "すすぎ1";
    if (state.phase === "rinse2")
        return "すすぎ2";
    return "脱水";
}
function driving(state: WashState): boolean {
    return state.power && !state.ending && !state.finished && state.lid === "closed";
}
function bothStopped(state: WashState): boolean {
    return (Math.abs(state.pulsatorOmega) < STOP_OMEGA &&
        Math.abs(state.tubOmega) < STOP_OMEGA &&
        Math.abs(state.motorOmega) < STOP_OMEGA);
}
function setPlug(p: Plug, closed: boolean): void {
    if (closed) {
        p.seg.ax = p.ax;
        p.seg.ay = p.ay;
        p.seg.bx = p.bx;
        p.seg.by = p.by;
    }
    else {
        p.seg.ax = -4000;
        p.seg.ay = -4000;
        p.seg.bx = -4000;
        p.seg.by = -4000;
    }
}
function enterPhase(state: WashState, phase: WashPhase): void {
    state.phase = phase;
    state.phaseLeft = PHASE_TIME[phase];
    if (isFill(phase))
        queueDrop(state, "water");
}
function queueDrop(state: WashState, kind: PourKind): void {
    if (state.queuedDrops.includes(kind))
        return;
    if (state.queuedDrops.length >= 2)
        return;
    state.queuedDrops.push(kind);
}
function roomFor(world: World): boolean {
    return world.particles.length + WASH_BALL_COUNT <= WASH_BALL_CAP;
}
function advance(state: WashState): void {
    const next = NEXT[state.phase];
    if (next === "end") {
        state.ending = true;
        return;
    }
    enterPhase(state, next);
}
function basketLayout(): {
    x: number;
    y: number;
}[] {
    const rows = PACK_ROWS.length;
    const bottomY = WASH_BASKET.bottomY - GRAIN_R - 12;
    const points: {
        x: number;
        y: number;
    }[] = [];
    for (let row = 0; row < rows; row++) {
        const n = PACK_ROWS[row];
        const y = bottomY - (rows - 1 - row) * PACK_ROW_H;
        const span = (n - 1) * PACK_GAP;
        const x0 = WASH_BASKET.cx - span / 2;
        for (let col = 0; col < n; col++)
            points.push({ x: x0 + col * PACK_GAP, y });
    }
    return points;
}
function basketZoneClear(world: World): boolean {
    const b = WASH_BASKET;
    return !world.particles.some((p) => p.y > b.mouthY - 8 && p.y < b.bottomY + 16 && Math.abs(p.x - b.cx) < b.mouthRx + 8);
}
function beginDrop(world: World, kind: PourKind): boolean {
    const state = world.wash;
    if (!state || !roomFor(world))
        return false;
    const layout = basketLayout();
    if (layout.length !== WASH_BALL_COUNT)
        return false;
    layout.forEach((at, i) => {
        const id = world.nextId++;
        const ball: Particle = {
            id,
            kind: "grain",
            x: at.x,
            y: at.y,
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
            color: kind === "water" ? WATER[i % WATER.length] : pickBallColor(id),
            trackId: null,
        };
        world.particles.push(ball);
    });
    state.activeDrop = kind;
    state.basketHold = BASKET_HOLD;
    return true;
}
function releaseBasket(world: World): void {
    const state = world.wash;
    if (!state)
        return;
    state.basketHold = 0;
    state.activeDrop = null;
    for (const p of world.particles) {
        if (!p.sleeping)
            continue;
        p.sleeping = false;
        p.sleepTime = 0;
    }
}
function stepBasket(world: World, dt: number): void {
    const state = world.wash;
    if (!state)
        return;
    if (state.basketHold > 0) {
        state.basketHold -= dt;
        if (state.basketHold <= 0)
            releaseBasket(world);
        return;
    }
    const next = state.queuedDrops[0];
    if (!next || !basketZoneClear(world))
        return;
    if (!roomFor(world)) {
        state.queuedDrops.shift();
        return;
    }
    if (!beginDrop(world, next))
        return;
    state.queuedDrops.shift();
}
function syncDrum(world: World, state: WashState): void {
    const p = WASH_LAYOUT.pulsator;
    const drum = world.drum;
    drum.x = p.x;
    drum.y = p.y;
    drum.r = 30;
    drum.collideR = 0;
    drum.omega = state.pulsatorOmega;
    drum.angle = state.pulsatorAngle;
}
function syncPlugs(world: World, state: WashState): void {
    const owned = parts.get(world);
    if (!owned)
        return;
    const live = state.lid !== "open";
    const spinning = live && state.phase === "spin";
    const draining = live && isDrain(state.phase);
    setPlug(owned.drain, !draining);
    setPlug(owned.exitL, !spinning);
    setPlug(owned.exitR, !spinning);
    setPlug(owned.floorL, !spinning);
    setPlug(owned.floorR, !spinning);
}
function speck(ox: number, oy: number, stick: number, n: number): WashDirt {
    return { ox, oy, stick, color: DIRT_COLORS[n % DIRT_COLORS.length] };
}
function createLaundry(): WashLaundry[] {
    const plan: {
        kind: WashLaundryKind;
        homeX: number;
        homeY: number;
        rest: number;
        phase: number;
        dirt: WashDirt[];
    }[] = [
        {
            kind: "towel",
            homeX: 548,
            homeY: 456,
            rest: -0.18,
            phase: 2.2,
            dirt: [speck(8, 6, 0.85, 7), speck(-14, 4, 1.5, 8), speck(2, -12, 2.05, 9)],
        },
        {
            kind: "shirt",
            homeX: 492,
            homeY: 428,
            rest: 0.52,
            phase: 0.3,
            dirt: [speck(0, 18, 0.5, 0), speck(10, 16, 1.7, 1), speck(-4, 8, 1.1, 2), speck(-24, -10, 2.2, 3)],
        },
        {
            kind: "sock",
            homeX: 572,
            homeY: 418,
            rest: -0.95,
            phase: 1.5,
            dirt: [speck(16, 10, 0.7, 4), speck(26, 6, 1.6, 5), speck(0, -14, 1.9, 6)],
        },
    ];
    return plan.map((item) => ({
        kind: item.kind,
        homeX: item.homeX,
        homeY: item.homeY,
        rest: item.rest,
        phase: item.phase,
        x: item.homeX,
        y: item.homeY,
        angle: item.rest,
        dirt: item.dirt,
    }));
}
export function washSpeckPosition(item: WashLaundry, dirt: WashDirt): {
    x: number;
    y: number;
} {
    const c = Math.cos(item.angle);
    const s = Math.sin(item.angle);
    return {
        x: item.x + dirt.ox * c - dirt.oy * s,
        y: item.y + dirt.ox * s + dirt.oy * c,
    };
}
function idleLaundryPose(item: WashLaundry, state: WashState, stirring: boolean): {
    x: number;
    y: number;
    angle: number;
} {
    if (!stirring)
        return { x: item.homeX, y: item.homeY, angle: item.rest };
    const s = Math.sin(state.agitateT * WASH_FLIP + item.phase);
    const c = Math.cos(state.agitateT * WASH_FLIP + item.phase);
    return {
        x: item.homeX + s * 22,
        y: item.homeY + c * 8,
        angle: item.rest + s * 0.42,
    };
}
function wallLaundryPose(item: WashLaundry): {
    x: number;
    y: number;
    angle: number;
} {
    const tub = WASH_LAYOUT.tub;
    if (item.kind === "shirt")
        return { x: tub.left + 24, y: 368, angle: -Math.PI / 2 };
    if (item.kind === "sock")
        return { x: tub.right - 24, y: 318, angle: Math.PI / 2 };
    return { x: tub.right - 24, y: 400, angle: Math.PI / 2 };
}
function laundryTarget(item: WashLaundry, state: WashState, stirring: boolean): {
    x: number;
    y: number;
    angle: number;
} {
    const idle = idleLaundryPose(item, state, stirring);
    const spinU = Math.min(1, Math.abs(state.tubOmega) / SPIN_TUB);
    const press = Math.min(1, (spinU * spinU) / 0.35);
    if (press <= 0)
        return idle;
    const wall = wallLaundryPose(item);
    const turn = Math.atan2(Math.sin(wall.angle - idle.angle), Math.cos(wall.angle - idle.angle));
    return {
        x: idle.x + (wall.x - idle.x) * press,
        y: idle.y + (wall.y - idle.y) * press,
        angle: idle.angle + turn * press,
    };
}
function clampLaundry(item: WashLaundry): void {
    const tub = WASH_LAYOUT.tub;
    const lipY = tub.bottom - WASH_LAYOUT.exit.lip;
    const mouth = WASH_LAYOUT.exit.mouth;
    item.x = Math.max(tub.left + 16, Math.min(tub.right - 16, item.x));
    item.y = Math.max(tub.top + 48, Math.min(tub.bottom - 30, item.y));
    if (item.y > lipY - 12) {
        item.x = Math.max(tub.left + mouth + 18, Math.min(tub.right - mouth - 18, item.x));
    }
}
function releaseDirt(world: World, x: number, y: number, color: string, state: WashState): void {
    const tub = WASH_LAYOUT.tub;
    const id = world.nextId++;
    const ball: Particle = {
        id,
        kind: "grain",
        x: Math.max(tub.left + DIRT_R + 4, Math.min(tub.right - DIRT_R - 4, x)),
        y: Math.max(tub.top + 40, Math.min(tub.bottom - DIRT_R - 8, y)),
        vx: Math.cos(state.pulsatorAngle + id) * 36,
        vy: -28,
        r: DIRT_R,
        frozen: false,
        sleeping: false,
        sleepTime: 0,
        standing: false,
        stem: 0,
        angle: 0,
        marked: false,
        color,
        trackId: null,
    };
    world.particles.push(ball);
}
function stepLaundry(world: World, dt: number, stirring: boolean): void {
    const state = world.wash;
    if (!state)
        return;
    const rate = 1 - Math.exp(-6 * dt);
    const agitation = stirring ? Math.min(1, Math.abs(state.pulsatorOmega) / WASH_OMEGA) : 0;
    const balls = stirring ? world.particles.filter((p) => !p.sleeping && p.kind === "grain") : [];
    for (const item of state.laundry) {
        const target = laundryTarget(item, state, stirring);
        item.x += (target.x - item.x) * rate;
        item.y += (target.y - item.y) * rate;
        const turn = Math.atan2(Math.sin(target.angle - item.angle), Math.cos(target.angle - item.angle));
        item.angle += turn * rate;
        clampLaundry(item);
        if (!stirring)
            continue;
        for (let i = item.dirt.length - 1; i >= 0; i--) {
            const dirt = item.dirt[i];
            const at = washSpeckPosition(item, dirt);
            let loosen = dt * 0.28 * agitation;
            for (const ball of balls) {
                const dist = Math.hypot(ball.x - at.x, ball.y - at.y);
                const reach = ball.r + 22;
                if (dist >= reach)
                    continue;
                const rub = (WATER as readonly string[]).includes(ball.color)
                    ? 4.2
                    : (DIRT_COLORS as readonly string[]).includes(ball.color)
                        ? 0
                        : 18;
                loosen += dt * rub * (1 - dist / reach);
            }
            dirt.stick -= loosen;
            if (dirt.stick > 0)
                continue;
            releaseDirt(world, at.x, at.y, dirt.color, state);
            item.dirt.splice(i, 1);
        }
    }
}
export function createWashState(): WashState {
    return {
        power: true,
        ending: false,
        finished: false,
        queuedDrops: ["water"],
        activeDrop: null,
        basketHold: 0,
        phase: "fill1",
        phaseLeft: PHASE_TIME.fill1,
        lid: "open",
        lidT: 0,
        lidFrom: WASH_LAYOUT.openAngle,
        lidAngle: WASH_LAYOUT.openAngle,
        pulsatorAngle: 0,
        pulsatorOmega: 0,
        tubAngle: 0,
        tubOmega: 0,
        motorAngle: 0,
        motorOmega: 0,
        agitateT: 0,
        stopHold: 0,
        laundry: createLaundry(),
        portId: 0,
        sawId: 0,
        coupled: false,
        sawJoined: false,
        motion: "coast",
        shaftTarget: 0,
    };
}
export function createWashWorld(): World {
    const tub = WASH_LAYOUT.tub;
    const drain = WASH_LAYOUT.drain;
    const exit = WASH_LAYOUT.exit;
    const lipY = tub.bottom - exit.lip;
    const drainPlug = plug(drain.x0 - 8, drain.y, drain.x1 + 8, drain.y, "washFloor");
    const exitL = plug(tub.left, lipY - 4, tub.left, tub.bottom + 2, "washWallL");
    const exitR = plug(tub.right, lipY - 4, tub.right, tub.bottom + 2, "washWallR");
    const floorL = plug(tub.left, tub.bottom, tub.left + exit.mouth + 6, tub.bottom, "washFloor");
    const floorR = plug(tub.right - exit.mouth - 6, tub.bottom, tub.right, tub.bottom, "washFloor");
    const world: World = {
        stage: "wash",
        nextId: 1,
        segments: [
            seg(tub.left, tub.top, tub.left, lipY, "washWallL"),
            exitL.seg,
            seg(tub.right, tub.top, tub.right, lipY, "washWallR"),
            exitR.seg,
            floorL.seg,
            seg(tub.left + exit.mouth, tub.bottom, drain.x0, drain.y, "washFloor"),
            drainPlug.seg,
            seg(drain.x1, drain.y, tub.right - exit.mouth, tub.bottom, "washFloor"),
            floorR.seg,
            seg(tub.left, tub.top, tub.cx - 40, tub.top, "washCeiling"),
            seg(tub.cx + 40, tub.top, tub.right, tub.top, "washCeiling"),
            seg(drain.x0, drain.y + 8, drain.x0 - 16, 710),
            seg(drain.x1, drain.y + 8, drain.x1 + 16, 710),
            seg(tub.left - 4, lipY + 6, tub.left - 22, 720),
            seg(tub.left + exit.mouth + 4, tub.bottom + 8, tub.left + exit.mouth - 8, 720),
            seg(tub.right + 4, lipY + 6, tub.right + 22, 720),
            seg(tub.right - exit.mouth - 4, tub.bottom + 8, tub.right - exit.mouth + 8, 720),
        ],
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
        wash: createWashState(),
    };
    const drive = WASH_LAYOUT.gears[0];
    const sawLayout = WASH_LAYOUT.gears[1];
    const port = makeWashGear(world, drive.x, drive.y, drive.r, 0);
    const saw = makeWashGear(world, sawLayout.x, sawLayout.y, sawLayout.r, WASH_SAW_PHASE);
    world.gears.push(port, saw);
    if (world.wash) {
        world.wash.portId = port.id;
        world.wash.sawId = saw.id;
    }
    parts.set(world, { drain: drainPlug, exitL, exitR, floorL, floorR });
    return world;
}
function makeWashGear(world: World, x: number, y: number, r: number, angle: number): Gear {
    return {
        id: world.nextId++,
        x,
        y,
        r,
        angle,
        omega: 0,
        drive: 0,
        drivePriority: 0,
        driveSeq: 0,
        placed: false,
        spin: "gear",
        washBuiltIn: true,
        washLinked: false,
    };
}
function washGear(world: World, id: number): Gear | undefined {
    if (!id)
        return undefined;
    return world.gears.find((g) => g.id === id);
}
function washPort(world: World): Gear | undefined {
    return washGear(world, world.wash?.portId ?? 0);
}
function washSaw(world: World): Gear | undefined {
    return washGear(world, world.wash?.sawId ?? 0);
}
function externalMesh(world: World, output: Gear): boolean {
    return world.gears.some((g) => g !== output && g.placed && g.spin === "gear" && !g.belt && !g.washBuiltIn && spinsMesh(output, g));
}
export function washGearMesh(world: World, p: {
    x: number;
    y: number;
    r: number;
}): boolean {
    const state = world.wash;
    if (!state || world.stage !== "wash")
        return false;
    const probe = { x: p.x, y: p.y, r: p.r } as Gear;
    return world.gears.some((g) => (g.id === state.portId || g.id === state.sawId) && spinsMesh(probe, g));
}
export function prepareWashDrive(world: World, dt: number): void {
    const state = world.wash;
    if (!state || world.stage !== "wash")
        return;
    if (state.power && !state.ending && !state.finished && (state.lid === "open" || state.lid === "opening")) {
        beginClose(state);
    }
    const lidBefore = state.lid;
    stepLid(state, dt);
    if (lidBefore !== "open" && state.lid === "open" && state.ending) {
        state.finished = true;
        state.power = false;
    }
    stepBasket(world, dt);
    const drive = driving(state);
    if (drive) {
        state.phaseLeft -= dt;
        if (state.phaseLeft <= 0)
            advance(state);
    }
    const stir = drive && isStir(state.phase);
    const fill = drive && isFill(state.phase);
    const spin = drive && state.phase === "spin";
    if (stir)
        state.agitateT += dt;
    const target = stir
        ? WASH_OMEGA * Math.sin(state.agitateT * WASH_FLIP)
        : fill
            ? 0.6
            : spin
                ? SPIN_TUB
                : 0;
    state.motion = stir ? "stir" : fill ? "fill" : spin ? "spin" : "coast";
    state.shaftTarget = target;
    const port = washPort(world);
    if (!port)
        return;
    const saw = washSaw(world);
    const portExternal = externalMesh(world, port);
    const sawExternal = saw ? externalMesh(world, saw) : false;
    if (saw) {
        port.washLinked = sawExternal;
        saw.washLinked = sawExternal;
    }
    const linked = portExternal || sawExternal;
    if (linked) {
        if (!state.coupled) {
            port.angle = state.motorAngle;
            port.omega = state.motorOmega;
        }
        if (saw && sawExternal && !state.sawJoined) {
            const ratio = port.r / saw.r;
            saw.angle = -port.angle * ratio + WASH_SAW_PHASE;
            saw.omega = -port.omega * ratio;
        }
        state.sawJoined = sawExternal;
        port.motorKind = "motor";
        port.drive = target * Math.max(10, port.r);
        state.coupled = true;
        return;
    }
    if (state.coupled) {
        state.motorOmega = port.omega;
        state.motorAngle = port.angle;
    }
    port.motorKind = undefined;
    port.drive = 0;
    port.omega = 0;
    port.washLinked = false;
    if (saw) {
        saw.washLinked = false;
        saw.motorKind = undefined;
        saw.drive = 0;
        saw.omega = 0;
    }
    state.coupled = false;
    state.sawJoined = false;
}
export function updateWash(world: World, dt: number): void {
    const state = world.wash;
    if (!state || world.stage !== "wash")
        return;
    const stir = state.motion === "stir";
    const target = state.shaftTarget;
    const port = state.coupled ? washPort(world) : undefined;
    if (port) {
        const shaft = port.omega;
        state.motorOmega = shaft;
        state.motorAngle = port.angle;
        if (state.motion === "stir") {
            state.pulsatorOmega = shaft;
            state.tubOmega = approach(state.tubOmega, 0, dt);
        }
        else if (state.motion === "fill") {
            state.pulsatorOmega = approach(state.pulsatorOmega, 0, dt);
            state.tubOmega = approach(state.tubOmega, 0, dt);
        }
        else if (state.motion === "spin") {
            state.tubOmega = shaft;
            state.pulsatorOmega = shaft * (SPIN_PULSATOR / SPIN_TUB);
        }
        else {
            state.pulsatorOmega *= Math.exp(-3.2 * dt);
            state.tubOmega *= Math.exp(-1.35 * dt);
        }
    }
    else if (state.motion === "stir") {
        state.pulsatorOmega = approach(state.pulsatorOmega, target, dt);
        state.tubOmega = approach(state.tubOmega, 0, dt);
        state.motorOmega = approach(state.motorOmega, target, dt);
    }
    else if (state.motion === "fill") {
        state.pulsatorOmega = approach(state.pulsatorOmega, 0, dt);
        state.tubOmega = approach(state.tubOmega, 0, dt);
        state.motorOmega = approach(state.motorOmega, target, dt);
    }
    else if (state.motion === "spin") {
        state.pulsatorOmega = approach(state.pulsatorOmega, SPIN_PULSATOR, dt);
        state.tubOmega = approach(state.tubOmega, target, dt);
        state.motorOmega = approach(state.motorOmega, target, dt);
    }
    else {
        state.pulsatorOmega *= Math.exp(-3.2 * dt);
        state.tubOmega *= Math.exp(-1.35 * dt);
        state.motorOmega *= Math.exp(-2.2 * dt);
    }
    state.pulsatorAngle += state.pulsatorOmega * dt;
    state.tubAngle += state.tubOmega * dt;
    if (!port)
        state.motorAngle += state.motorOmega * dt;
    stepLaundry(world, dt, stir);
    const wantOpen = !state.power || state.ending;
    if (wantOpen && bothStopped(state))
        state.stopHold += dt;
    else
        state.stopHold = 0;
    if (wantOpen &&
        state.stopHold >= STOP_HOLD &&
        (state.lid === "closed" || state.lid === "click" || state.lid === "closing")) {
        beginOpen(state);
    }
    syncDrum(world, state);
    syncPlugs(world, state);
}
export function applyWashForces(world: World, dt: number): void {
    const state = world.wash;
    if (!state || world.stage !== "wash")
        return;
    const tub = WASH_LAYOUT.tub;
    const drain = WASH_LAYOUT.drain;
    const exit = WASH_LAYOUT.exit;
    const spinning = state.phase === "spin" && Math.abs(state.tubOmega) > 0.8;
    const draining = state.lid !== "open" && isDrain(state.phase);
    const stirring = state.power && !state.ending && !state.finished && state.lid === "closed" && isStir(state.phase);
    if (!spinning && !draining && !stirring)
        return;
    const holeX = (drain.x0 + drain.x1) / 2;
    for (const p of world.particles) {
        if (p.sleeping || p.frozen || p.kind !== "grain")
            continue;
        if (p.x < tub.left - 8 || p.x > tub.right + 8 || p.y < tub.top - 24 || p.y > tub.bottom + 18)
            continue;
        const px = p.x - WASH_LAYOUT.pulsator.x;
        const py = p.y - WASH_LAYOUT.pulsator.y;
        const pd = Math.hypot(px, py);
        if (stirring && pd < 140) {
            const falloff = 1 - pd / 140;
            p.vx += state.pulsatorOmega * 1600 * falloff * dt;
            p.vy -= Math.abs(state.pulsatorOmega) * 650 * falloff * dt;
        }
        if (spinning) {
            const dx = p.x - tub.cx;
            const sign = Math.abs(dx) < 1 ? (p.id % 2 === 0 ? 1 : -1) : Math.sign(dx);
            p.vx += sign * 2200 * dt;
            const nearMouth = p.x < tub.left + exit.mouth + 16 || p.x > tub.right - exit.mouth - 16;
            if (nearMouth && p.y > tub.bottom - 80)
                p.vy += 520 * dt;
        }
        if (draining) {
            const dir = Math.sign(holeX - p.x);
            if (dir !== 0)
                p.vx += dir * 400 * dt;
            if (p.y > tub.bottom - 64 && p.x > drain.x0 - 18 && p.x < drain.x1 + 18)
                p.vy += 280 * dt;
        }
    }
}
export function toggleWashPower(world: World): void {
    const state = world.wash;
    if (!state || world.stage !== "wash")
        return;
    if (state.finished) {
        beginWashCycle(state);
        return;
    }
    if (state.ending)
        return;
    state.power = !state.power;
}
function beginWashCycle(state: WashState): void {
    state.power = true;
    state.ending = false;
    state.finished = false;
    state.stopHold = 0;
    state.agitateT = 0;
    state.motion = "coast";
    state.shaftTarget = 0;
    enterPhase(state, "fill1");
}
export function pourWash(world: World): void {
    const state = world.wash;
    if (!state || world.stage !== "wash")
        return;
    if (!roomFor(world))
        return;
    queueDrop(state, "detergent");
}
export function washDetergentMode(world: World): "ready" | "busy" | "full" {
    const state = world.wash;
    if (!state || world.stage !== "wash")
        return "ready";
    if (state.activeDrop === "detergent" || state.queuedDrops.includes("detergent"))
        return "busy";
    if (!roomFor(world))
        return "full";
    return "ready";
}
export function hitWashControl(world: World, x: number, y: number): "power" | "drop" | null {
    if (world.stage !== "wash")
        return null;
    const hit = (b: {
        x: number;
        y: number;
        w: number;
        h: number;
    }) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    if (hit(WASH_LAYOUT.power))
        return "power";
    if (hit(WASH_LAYOUT.drop))
        return "drop";
    return null;
}
