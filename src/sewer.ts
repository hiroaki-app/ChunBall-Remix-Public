import { GRAIN_R, type Particle, type Segment, type World } from "./model";
import { pickBallColor } from "./ballLook";
export const SL = {
    spawn: { x: 110, y: 176 },
    screen: { x: 248, y: 228, w: 140, h: 58 },
    sed: { x: 468, y: 248, w: 252, h: 252 },
    swirl: { x: 884, y: 404, r: 90 },
    final: { x: 1048, y: 328, w: 148, h: 196 },
};
export const WATER_CAP = 130;
export const SED_SWIRL_PIPE = {
    halfWidth: 13,
    points: [{ x: 720, y: 276 }, { x: 758, y: 276 },
        { x: 758, y: 404 }, { x: 794, y: 404 }],
};
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
        marked: false,
        color: extra.color ?? pickBallColor(id),
        trackId: extra.trackId ?? null,
    };
}
function offsetPoly(pts: {
    x: number;
    y: number;
}[], hw: number): {
    x: number;
    y: number;
}[] {
    const out: {
        x: number;
        y: number;
    }[] = [];
    for (let i = 0; i < pts.length; i++) {
        const prev = pts[i === 0 ? 0 : i - 1];
        const cur = pts[i];
        const next = pts[i === pts.length - 1 ? i : i + 1];
        let e1x = cur.x - prev.x;
        let e1y = cur.y - prev.y;
        let e2x = next.x - cur.x;
        let e2y = next.y - cur.y;
        if (i === 0) {
            e1x = e2x;
            e1y = e2y;
        }
        if (i === pts.length - 1) {
            e2x = e1x;
            e2y = e1y;
        }
        const l1 = Math.hypot(e1x, e1y) || 1;
        const l2 = Math.hypot(e2x, e2y) || 1;
        e1x /= l1;
        e1y /= l1;
        e2x /= l2;
        e2y /= l2;
        const n1x = -e1y;
        const n1y = e1x;
        const n2x = -e2y;
        const n2y = e2x;
        let mx = n1x + n2x;
        let my = n1y + n2y;
        const ml = Math.hypot(mx, my);
        if (ml < 0.25) {
            out.push({ x: cur.x + n1x * hw, y: cur.y + n1y * hw });
            continue;
        }
        mx /= ml;
        my /= ml;
        const denom = mx * n1x + my * n1y;
        const scale = Math.abs(denom) < 0.2 ? hw : hw / denom;
        const capped = Math.max(-hw * 2.4, Math.min(hw * 2.4, scale));
        out.push({ x: cur.x + mx * capped, y: cur.y + my * capped });
    }
    return out;
}
function addPolyPipe(s: Segment[], pts: {
    x: number;
    y: number;
}[], hw: number, conv: number, mirroredWalls = false): void {
    const left = offsetPoly(pts, hw);
    const right = mirroredWalls
        ? left.map((p, i) => ({ x: pts[i].x * 2 - p.x, y: pts[i].y * 2 - p.y }))
        : offsetPoly(pts, -hw);
    for (let i = 0; i < pts.length - 1; i++) {
        s.push(seg(left[i].x, left[i].y, left[i + 1].x, left[i + 1].y, conv));
        s.push(seg(right[i].x, right[i].y, right[i + 1].x, right[i + 1].y, conv));
    }
}
function addArc(s: Segment[], cx: number, cy: number, r: number, a0: number, a1: number, n: number, conv = 0): void {
    for (let i = 0; i < n; i++) {
        const t0 = a0 + (i / n) * (a1 - a0);
        const t1 = a0 + ((i + 1) / n) * (a1 - a0);
        s.push(seg(cx + Math.cos(t0) * r, cy + Math.sin(t0) * r, cx + Math.cos(t1) * r, cy + Math.sin(t1) * r, conv));
    }
}
function idleRotator() {
    return { x: -200, y: -200, r: 8, collideR: 0, angle: 0, omega: 0 };
}
export function createSewerWorld(): World {
    const world: World = {
        stage: "sewer",
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
    const hwWide = 18;
    const hwMid = 13;
    const sw = SL.swirl;
    const sc = SL.screen;
    const sd = SL.sed;
    const fn = SL.final;
    addPolyPipe(s, [
        { x: 110, y: 168 },
        { x: 110, y: 268 },
        { x: 248, y: 268 },
    ], hwWide, 100);
    s.push(seg(sc.x, sc.y, sc.x + sc.w, sc.y, 0));
    s.push(seg(sc.x, sc.y + sc.h, sc.x + sc.w, sc.y + sc.h, 55));
    s.push(seg(sc.x, sc.y, sc.x, 252, 0));
    s.push(seg(sc.x + sc.w, sc.y, sc.x + sc.w, 252, 0));
    for (let x = sc.x + 36; x < sc.x + sc.w - 18; x += 28) {
        s.push(seg(x, sc.y + 5, x, sc.y + 34, 0));
    }
    addPolyPipe(s, [
        { x: 388, y: 268 },
        { x: 468, y: 268 },
    ], hwMid, 130);
    s.push(seg(sd.x, sd.y, sd.x + sd.w, sd.y, 0));
    s.push(seg(sd.x, sd.y + sd.h, sd.x + sd.w, sd.y + sd.h, 36));
    s.push(seg(sd.x, 300, sd.x, sd.y + sd.h, 0));
    s.push(seg(sd.x + sd.w, sd.y, sd.x + sd.w, SED_SWIRL_PIPE.points[0].y - SED_SWIRL_PIPE.halfWidth, 0));
    s.push(seg(sd.x + sd.w, SED_SWIRL_PIPE.points[0].y + SED_SWIRL_PIPE.halfWidth, sd.x + sd.w, sd.y + sd.h, 0));
    addPolyPipe(s, SED_SWIRL_PIPE.points, SED_SWIRL_PIPE.halfWidth, 110, true);
    addArc(s, sw.x, sw.y, sw.r, 1.08, Math.PI - 0.2, 12, 40);
    addArc(s, sw.x, sw.y, sw.r, Math.PI + 0.2, Math.PI * 2 - 0.18, 14, 40);
    addArc(s, sw.x, sw.y, 26, 0, Math.PI * 2, 14, 0);
    addPolyPipe(s, [
        { x: 956, y: 470 },
        { x: 1048, y: 502 },
    ], 14, 140);
    s.push(seg(918, 478, 962, 462, 120));
    s.push(seg(fn.x, fn.y, fn.x + fn.w, fn.y, 0));
    s.push(seg(fn.x, fn.y + fn.h, fn.x + fn.w, fn.y + fn.h, 90));
    s.push(seg(fn.x, fn.y, fn.x, 478, 0));
    s.push(seg(fn.x, 528, fn.x, fn.y + fn.h, 0));
    s.push(seg(fn.x + fn.w, fn.y, fn.x + fn.w, 492, 0));
    addPolyPipe(s, [
        { x: 1196, y: 510 },
        { x: 1228, y: 516 },
    ], hwMid, 130);
    s.push(seg(1224, 528, 1336, 556, 150));
    world.segments = s;
    world.particles.push(ball(world, "grain", SL.spawn.x, SL.spawn.y + 10, { vy: 40 }));
    const seeds: [
        number,
        number,
        number,
        number
    ][] = [
        [150, 268, 70, 0],
        [190, 268, 80, 0],
        [226, 268, 75, 0],
        [270, 276, 40, 0],
        [310, 276, 42, 0],
        [350, 276, 45, 0],
        [420, 268, 90, 0],
        [500, 310, 20, 40],
        [540, 360, 10, 20],
        [580, 430, 8, 8],
        [620, 470, 12, 4],
        [660, 480, 16, 2],
        [540, 488, 6, 0],
        [600, 488, 8, 0],
        [500, 488, 4, 0],
        [640, 360, 18, -8],
        [680, 320, 22, -20],
        [740, 276, 50, 10],
        [758, 320, 0, 70],
        [758, 360, 0, 80],
        [1000, 488, 50, 16],
        [1080, 500, 30, 8],
        [1120, 500, 36, 6],
        [1160, 508, 55, 4],
        [1210, 520, 70, 8],
        [1250, 538, 80, 12],
    ];
    for (const [x, y, vx, vy] of seeds) {
        world.particles.push(ball(world, "grain", x, y, { vx, vy }));
    }
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.2;
        const rr = 48 + (i % 3) * 8;
        world.particles.push(ball(world, "grain", sw.x + Math.cos(a) * rr, sw.y + Math.sin(a) * rr, {
            vx: -Math.sin(a) * 160,
            vy: Math.cos(a) * 160,
        }));
    }
    world.particles.push(ball(world, "other", 286, 246, { frozen: true }));
    world.particles.push(ball(world, "other", 314, 242, { frozen: true }));
    world.particles.push(ball(world, "other", 342, 248, { frozen: true }));
    return world;
}
export function spawnSewerWater(world: World): void {
    const water = world.particles.filter((p) => p.kind === "grain").length;
    if (water >= WATER_CAP)
        return;
    const inlet = world.particles.filter((p) => p.kind === "grain" && p.x < 248).length;
    if (inlet >= 12)
        return;
    world.particles.push(ball(world, "grain", SL.spawn.x + (Math.random() - 0.5) * 10, SL.spawn.y, {
        vy: 36 + Math.random() * 22,
        vx: (Math.random() - 0.5) * 8,
    }));
}
