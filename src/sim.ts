import { GRAIN_R, BALL_MASS, MAX_PARTICLES, type Gear, type Particle, type Rotator, type Segment, type World } from "./model";
import { SL, spawnSewerWater, WATER_CAP, SED_SWIRL_PIPE } from "./sewer";
import { spawnFreeBall, FREE_BALL_CAP } from "./free";
import { SANDBOX_BALL_COUNT, updateSandbox } from "./sandbox";
import { applyWashForces, prepareWashDrive, updateWash } from "./wash";
import { applyBelts, solveSpin, solveConfiguredTransmission, advanceConfiguredMotors, finishConfiguredStep, usesConfiguredSubsteps } from "./spin";
import { driveFreeBelts } from "./freeBelt";
import { collideIndependentFollower } from "./gearContact";
import { beltFriction } from "./beltContact";
import { compatibleRestitution } from "./contactCompatibility";
import { crawlerTops, sweepCrawlerTop, type CrawlerTop } from "./crawlerSweep";
import { applyBeltGearContacts, prepareBeltGearContacts, beltGearSourceGears } from "./beltGearContact";
const coupledDamping = new WeakSet<Particle>();
import { applyBlowers } from "./blower";
import { applyRecvTruckCargo, inRecvTruckHopper, isRecvTruckCargo, recvTruckHopperLive, stageHasRecvTruck, updateRecvTruck } from "./recvTruck";
import { updateGates } from "./gate";
import { recvTruckBySegment } from "./recvTruck";
const G = 980;
const REST = 0.2;
const FRIC = 0.18;
const SUBSTEPS = 4;
const PLACED_DRAG = 0.08;
const SLOPE_ACCEL = 1600;
const SLOPE_CLIMB_DRAG = 4.5;
const COLLISION_CELL = GRAIN_R * 3;
const BELT_SURFACE_DRAG = 3.2;
const BELT_GRIP = 11;
function closestOnSeg(px: number, py: number, s: Segment): {
    x: number;
    y: number;
    abx: number;
    aby: number;
    len: number;
} {
    const abx = s.bx - s.ax;
    const aby = s.by - s.ay;
    const apx = px - s.ax;
    const apy = py - s.ay;
    const ab2 = abx * abx + aby * aby;
    const t = ab2 < 1e-8 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    const len = Math.sqrt(ab2);
    return { x: s.ax + abx * t, y: s.ay + aby * t, abx, aby, len };
}
const WASH_SHELL_CATCH = 28;
function containWashShell(p: Particle, s: Segment): boolean {
    const tag = s.tag;
    if (tag !== "washFloor" && tag !== "washCeiling" && tag !== "washWallL" && tag !== "washWallR") {
        return false;
    }
    if (tag === "washFloor" || tag === "washCeiling") {
        const y = s.ay;
        const x0 = Math.min(s.ax, s.bx);
        const x1 = Math.max(s.ax, s.bx);
        if (p.x < x0 || p.x > x1)
            return true;
        const dist = tag === "washFloor" ? y - p.y : p.y - y;
        if (dist >= p.r || dist < -WASH_SHELL_CATCH)
            return true;
        if (tag === "washFloor") {
            p.y -= p.r - dist;
            if (p.vy > 0)
                p.vy = -p.vy * REST;
        }
        else {
            p.y += p.r - dist;
            if (p.vy < 0)
                p.vy = -p.vy * REST;
        }
        p.vx *= 1 - FRIC;
        return true;
    }
    const x = s.ax;
    const y0 = Math.min(s.ay, s.by);
    const y1 = Math.max(s.ay, s.by);
    if (p.y < y0 || p.y > y1)
        return true;
    const inward = tag === "washWallL" ? 1 : -1;
    const dist = (p.x - x) * inward;
    if (dist >= p.r || dist < -WASH_SHELL_CATCH)
        return true;
    p.x += inward * (p.r - dist);
    const vn = p.vx * inward;
    if (vn < 0)
        p.vx -= (1 + REST) * vn * inward;
    p.vy *= 1 - FRIC;
    return true;
}
function collideSegment(p: Particle, s: Segment, dt: number, hopperHold: boolean, hopperWalls: boolean, world: World, claimed: Set<object>): void {
    if (p.standing || p.frozen || p.sleeping)
        return;
    if (containWashShell(p, s))
        return;
    if (hopperHold && s.tag !== "recvTruck")
        return;
    if (s.tag === "recvTruck" && !hopperWalls)
        return;
    const c = closestOnSeg(p.x, p.y, s);
    if (c.len < 1e-5)
        return;
    let dx = p.x - c.x;
    let dy = p.y - c.y;
    let d = Math.hypot(dx, dy);
    let nx: number;
    let ny: number;
    if (d < 1e-5) {
        nx = -c.aby / c.len;
        ny = c.abx / c.len;
        d = 0;
    }
    else {
        nx = dx / d;
        ny = dy / d;
    }
    if (d >= p.r)
        return;
    const overlap = p.r - d;
    p.x += nx * overlap;
    p.y += ny * overlap;
    const vn = p.vx * nx + p.vy * ny;
    let tvx = p.vx;
    let tvy = p.vy;
    if (vn < 0) {
        tvx -= (1 + REST) * vn * nx;
        tvy -= (1 + REST) * vn * ny;
    }
    const tx = -ny;
    const ty = nx;
    let vt = tvx * tx + tvy * ty;
    let vn2 = tvx * nx + tvy * ny;
    const coupled = ny < -0.25 && c.len > 1e-5 && (s.freeBelt !== undefined || s.belt)
        ? beltFriction(world, s, vt, Math.max(0, -(1 + REST) * vn) * BALL_MASS, c.abx / c.len * tx + c.aby / c.len * ty, dt, claimed) : undefined;
    if (coupled !== undefined) {
        coupledDamping.add(p);
        vt = coupled;
        vn2 *= 0.15;
    }
    else if (s.freeBelt !== undefined) {
        if (ny < -0.25 && c.len > 1e-5 && s.conveyor !== 0) {
            const target = s.conveyor * (c.abx / c.len * tx + c.aby / c.len * ty);
            const change = (target - vt) * (1 - Math.exp(-35 * dt));
            vt += Math.max(-2400 * dt, Math.min(2400 * dt, change));
            vn2 *= 0.15;
        }
        else
            vt *= Math.max(0, 1 - BELT_SURFACE_DRAG * dt);
    }
    else if (s.belt) {
        vt *= Math.max(0, 1 - BELT_SURFACE_DRAG * dt);
        if (c.len > 1e-5 && s.conveyor !== 0) {
            const dirx = c.abx / c.len;
            const diry = c.aby / c.len;
            const beltVt = s.conveyor * (dirx * tx + diry * ty);
            const slip = beltVt - vt;
            const catchUp = 1 - Math.exp(-BELT_GRIP * dt);
            vt += slip * catchUp;
        }
    }
    else if (s.placed) {
        vt *= Math.max(0, 1 - PLACED_DRAG * dt);
        if (c.len > 1e-5) {
            let ux = c.abx / c.len;
            let uy = c.aby / c.len;
            if (uy < 0) {
                ux = -ux;
                uy = -uy;
            }
            const along = ux * tx + uy * ty;
            if (vt * along >= 0) {
                vt += SLOPE_ACCEL * uy * along * dt;
            }
            else {
                vt *= Math.max(0, 1 - SLOPE_CLIMB_DRAG * uy * dt);
            }
        }
    }
    else {
        vt *= 1 - FRIC;
        if (s.conveyor !== 0 && c.len > 1e-5) {
            const dirx = c.abx / c.len;
            const diry = c.aby / c.len;
            const convT = s.conveyor * (dirx * tx + diry * ty);
            vt = vt * 0.55 + convT * 0.45;
        }
    }
    p.vx = vn2 * nx + vt * tx;
    p.vy = vn2 * ny + vt * ty;
}
function collideParticles(a: Particle, b: Particle, skip: (p: Particle) => boolean): void {
    if (a.standing || b.standing)
        return;
    if (skip(a) || skip(b))
        return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const min = a.r + b.r;
    if (d < 1e-5 || d >= min)
        return;
    const nx = dx / d;
    const ny = dy / d;
    const overlap = min - d;
    if (a.sleeping && !b.sleeping && Math.hypot(b.vx, b.vy) > 80) {
        a.sleeping = false;
        a.sleepTime = 0;
    }
    if (b.sleeping && !a.sleeping && Math.hypot(a.vx, a.vy) > 80) {
        b.sleeping = false;
        b.sleepTime = 0;
    }
    const aFixed = a.frozen || a.sleeping;
    const bFixed = b.frozen || b.sleeping;
    if (aFixed && bFixed)
        return;
    if (aFixed) {
        b.x += nx * overlap;
        b.y += ny * overlap;
    }
    else if (bFixed) {
        a.x -= nx * overlap;
        a.y -= ny * overlap;
    }
    else {
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;
    }
    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn > 0)
        return;
    const imp = -(1 + compatibleRestitution(a, b, REST)) * vn;
    const ma = aFixed ? 0 : 1;
    const mb = bFixed ? 0 : 1;
    const msum = ma + mb;
    if (msum === 0)
        return;
    if (!aFixed) {
        a.vx -= imp * nx * (mb / msum);
        a.vy -= imp * ny * (mb / msum);
    }
    if (!bFixed) {
        b.vx += imp * nx * (ma / msum);
        b.vy += imp * ny * (ma / msum);
    }
}
function kickByRotator(p: Particle, r: Rotator): void {
    if (p.standing || p.frozen || p.sleeping)
        return;
    if (r.collideR <= 0)
        return;
    const dx = p.x - r.x;
    const dy = p.y - r.y;
    const d = Math.hypot(dx, dy);
    const min = r.collideR + p.r;
    if (d < 1e-5 || d > min + 18)
        return;
    const nx = dx / d;
    const ny = dy / d;
    if (d < min) {
        const overlap = min - d;
        p.x += nx * overlap;
        p.y += ny * overlap;
    }
    const tvx = -ny * r.omega * r.r;
    const tvy = nx * r.omega * r.r;
    const blend = 0.2;
    p.vx += (tvx - p.vx) * blend;
    p.vy += (tvy - p.vy) * blend;
}
function kickByGear(p: Particle, g: Gear, world: World, claimed: Set<object>): void {
    if (g.spin !== "gear")
        return;
    if (p.standing || p.frozen || p.sleeping)
        return;
    if (collideIndependentFollower(world, p, g, claimed))
        return;
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const d = Math.hypot(dx, dy);
    const min = g.r * 0.92 + p.r;
    if (d < 1e-5 || d > min)
        return;
    const nx = dx / d;
    const ny = dy / d;
    const overlap = min - d;
    p.x += nx * overlap;
    p.y += ny * overlap;
    const tvx = -ny * g.omega * g.r;
    const tvy = nx * g.omega * g.r;
    p.vx = p.vx * 0.72 + tvx * 0.28;
    p.vy = p.vy * 0.72 + tvy * 0.28;
}
function applySewerFlow(world: World, dt: number): void {
    const sd = SL.sed;
    const sw = SL.swirl;
    const fn = SL.final;
    const sedR = sd.x + sd.w;
    const sedB = sd.y + sd.h;
    const fnR = fn.x + fn.w;
    const fnB = fn.y + fn.h;
    for (const p of world.particles) {
        if (p.frozen || p.standing || p.sleeping)
            continue;
        if (p.kind !== "grain")
            continue;
        const sdx = p.x - sw.x;
        const sdy = p.y - sw.y;
        const swD = Math.hypot(sdx, sdy);
        if (p.x > 92 && p.x < 128 && p.y > 160 && p.y < 258) {
            p.vy += 260 * dt;
            p.vx += (110 - p.x) * 10 * dt;
            continue;
        }
        if (p.x > 112 && p.x < 248 && p.y > 248 && p.y < 288) {
            p.vx += 150 * dt;
            p.vy -= G * 0.45 * dt;
            continue;
        }
        if (p.x >= 248 && p.x <= 388 && p.y > 220 && p.y < 292) {
            p.vx += 55 * dt;
            if (p.vx > 70)
                p.vx *= 1 - 1.8 * dt;
            p.vy -= G * 0.2 * dt;
            continue;
        }
        if (p.x > 388 && p.x < 470 && p.y > 248 && p.y < 292) {
            p.vx += 220 * dt;
            p.vy -= G * 0.35 * dt;
            continue;
        }
        if (p.x > sd.x && p.x < sedR && p.y > sd.y && p.y < sedB + 6) {
            p.vx *= 1 - Math.min(0.88, 1.25 * dt);
            p.vy *= 1 - Math.min(0.4, 0.5 * dt);
            if (p.x < sd.x + 160)
                p.vy += 220 * dt;
            if (p.y > sd.y + 90)
                p.vx += 42 * dt;
            else
                p.vx += 10 * dt;
            if (p.x > sedR - 84) {
                const entryY = SED_SWIRL_PIPE.points[0].y;
                if (p.y > entryY + 40)
                    p.vy -= 1360 * dt;
                else {
                    p.vy += ((entryY - p.y) * 16 - p.vy * 8 - G) * dt;
                }
                p.vx += 110 * dt;
            }
            if (p.x > sedR - 64) {
                if (Math.abs(p.y - SED_SWIRL_PIPE.points[0].y) <= SED_SWIRL_PIPE.halfWidth - p.r)
                    p.vx += 260 * dt;
                else
                    p.vx *= Math.exp(-8 * dt);
            }
            continue;
        }
        if (swD < sw.r + 16 && p.stem > 0 && p.stem < 5.3)
            continue;
        const [entry, top, bottom, outlet] = SED_SWIRL_PIPE.points;
        const hw = SED_SWIRL_PIPE.halfWidth;
        const inUpper = p.x >= entry.x && p.x <= top.x + hw && Math.abs(p.y - top.y) <= hw;
        const inVertical = Math.abs(p.x - top.x) <= hw && p.y >= top.y && p.y <= bottom.y;
        const inLower = p.x >= bottom.x - hw && p.x <= outlet.x && Math.abs(p.y - bottom.y) <= hw;
        if (inUpper || inVertical || inLower) {
            if (inUpper && p.x < top.x - p.r)
                p.vx += 160 * dt;
            else if (p.y < bottom.y - hw) {
                p.vy += 320 * dt;
                p.vx += (top.x - p.x) * 12 * dt;
            }
            else {
                p.vx += 180 * dt;
                p.vy += (bottom.y - p.y) * 10 * dt;
            }
            continue;
        }
        if (p.x > 920 && p.x < 1050 && p.y > 440 && p.y < 530) {
            p.vx += 240 * dt;
            p.vy += 40 * dt;
            continue;
        }
        if (p.x > fn.x && p.x < fnR && p.y > fn.y && p.y < fnB + 8) {
            p.vx *= 1 - Math.min(0.6, 0.8 * dt);
            p.vx += 70 * dt;
            if (p.y < fn.y + 80)
                p.vy += 40 * dt;
            if (p.y > fnB - 50) {
                p.vx += 160 * dt;
                p.vy -= G * 0.25 * dt;
            }
            continue;
        }
        if (p.x > fnR - 8) {
            p.vx += 180 * dt;
            p.vy -= G * 0.15 * dt;
        }
    }
}
function stepPhysics(world: World, dt: number, tops: Map<Segment, CrawlerTop>): void {
    const hopperWalls = recvTruckHopperLive(world);
    const claimed = new Set<object>();
    const previous = tops.size ? new Map<Particle, {
        x: number;
        y: number;
    }>() : undefined;
    for (const p of world.particles) {
        if (p.standing || p.frozen || p.sleeping)
            continue;
        if (isRecvTruckCargo(world, p))
            continue;
        p.vy += G * dt;
        const drag = coupledDamping.has(p) ? Math.pow(0.999, dt * 240) : 0.999;
        coupledDamping.delete(p);
        p.vx *= drag;
        p.vy *= drag;
        const spd = Math.hypot(p.vx, p.vy);
        const cap = 640;
        if (spd > cap) {
            p.vx = (p.vx / spd) * cap;
            p.vy = (p.vy / spd) * cap;
        }
        previous?.set(p, { x: p.x, y: p.y });
        p.x += p.vx * dt;
        p.y += p.vy * dt;
    }
    for (const p of world.particles) {
        if (isRecvTruckCargo(world, p))
            continue;
        claimed.clear();
        for (const s of world.segments) {
            if (s.tag === "placedGate") {
                const g = world.gates.find((x) => x.id === s.stroke);
                if (!g?.solid)
                    continue;
            }
            if (s.tag === "recvTruck") {
                const t = recvTruckBySegment(world, s);
                if (!t || (t.status !== "approaching" && t.status !== "waiting"))
                    continue;
            }
            const top = tops.get(s), old = previous?.get(p);
            if (top && old && !inRecvTruckHopper(world, p, 6)) {
                const contact = sweepCrawlerTop(p, old, top);
                if (contact) {
                    p.x = contact.x;
                    p.y = contact.y;
                }
            }
            collideSegment(p, s, dt, inRecvTruckHopper(world, p, 6), hopperWalls, world, claimed);
        }
        if (!inRecvTruckHopper(world, p, 6)) {
        }
        kickByRotator(p, world.drum);
        for (const g of world.gears)
            kickByGear(p, g, world, claimed);
    }
    const list = world.particles;
    const grid = new Map<string, Particle[]>();
    for (const p of list) {
        if (p.standing || isRecvTruckCargo(world, p))
            continue;
        const key = `${Math.floor(p.x / COLLISION_CELL)},${Math.floor(p.y / COLLISION_CELL)}`;
        const cell = grid.get(key);
        if (cell)
            cell.push(p);
        else
            grid.set(key, [p]);
    }
    const awake = list.filter((p) => !p.sleeping && !p.standing && !isRecvTruckCargo(world, p));
    for (const a of awake) {
        const gx = Math.floor(a.x / COLLISION_CELL);
        const gy = Math.floor(a.y / COLLISION_CELL);
        for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
                const cell = grid.get(`${gx + ox},${gy + oy}`);
                if (!cell)
                    continue;
                for (const b of cell) {
                    if (a === b || (!b.sleeping && a.id >= b.id))
                        continue;
                    collideParticles(a, b, () => false);
                }
            }
        }
    }
    if (world.stage === "wash") {
        for (const p of world.particles) {
            if (p.standing || p.frozen || p.sleeping)
                continue;
            for (const s of world.segments)
                containWashShell(p, s);
        }
    }
}
function cull(world: World): void {
    world.particles = world.particles.filter(p => {
        if (p.marked)
            return !((world.stage === 'sewer' || world.stage === 'free') && (p.x > 1340 || p.x < -60 || p.y > 820));
        if (inRecvTruckHopper(world, p, 8))
            return p.y >= -40 && p.y <= 780;
        return p.x >= -40 && p.x <= 1320 && p.y >= -40 && p.y <= 780;
    });
    const cap = world.stage === 'sewer' ? WATER_CAP : world.stage === 'free' ? FREE_BALL_CAP : world.stage === 'sandbox' ? SANDBOX_BALL_COUNT : 400;
    const grains = world.particles.filter(p => p.kind === 'grain');
    if (grains.length > cap) {
        const extra = new Set(grains.filter(p => !inRecvTruckHopper(world, p, 8)).slice(0, grains.length - cap).map(p => p.id));
        world.particles = world.particles.filter(p => !extra.has(p.id));
    }
    if (world.particles.length > MAX_PARTICLES) {
        const keep = world.particles.filter(p => p.marked || (p.kind === 'grain' && inRecvTruckHopper(world, p, 8)));
        const rest = world.particles.filter(p => !keep.includes(p));
        rest.splice(0, Math.max(0, keep.length + rest.length - MAX_PARTICLES));
        world.particles = keep.concat(rest);
    }
}
function nearPlacedToy(world: World, p: Particle): boolean {
    for (const g of world.gears) {
        if (Math.hypot(g.x - p.x, g.y - p.y) < g.r + p.r + 6)
            return true;
    }
    for (const s of world.segments) {
        if (!s.placed)
            continue;
        const c = closestOnSeg(p.x, p.y, s);
        if (Math.hypot(p.x - c.x, p.y - c.y) < p.r + 8)
            return true;
    }
    return false;
}
function conveySwirl(world: World, dt: number): void {
    const sw = SL.swirl;
    const omega = 3.15;
    const hold = 4.8;
    for (const p of world.particles) {
        if (p.frozen || p.standing || p.sleeping)
            continue;
        if (p.kind !== "grain")
            continue;
        const dx = p.x - sw.x;
        const dy = p.y - sw.y;
        const d = Math.hypot(dx, dy);
        if (d > sw.r + 16) {
            if (p.stem > 0 && p.stem < hold)
                p.stem = 0;
            continue;
        }
        const outlet = SED_SWIRL_PIPE.points[3];
        if (p.x < outlet.x + p.r && p.stem <= 0)
            continue;
        const nearInlet = p.x >= outlet.x + p.r && p.x < sw.x - sw.r + 38 &&
            Math.abs(p.y - outlet.y) <= SED_SWIRL_PIPE.halfWidth;
        if (d > sw.r + 6 && p.stem <= 0 && !nearInlet)
            continue;
        if (nearPlacedToy(world, p)) {
            if (p.stem > 0 && p.stem < hold)
                p.stem = 0;
            continue;
        }
        p.stem += dt;
        if (p.stem < hold) {
            let ang = Math.atan2(dy, dx);
            if (d < 1e-4)
                ang = 0;
            ang += omega * dt;
            const ring = 52 + (p.id % 5) * 4;
            const nx = Math.cos(ang);
            const ny = Math.sin(ang);
            p.x = sw.x + nx * ring;
            p.y = sw.y + ny * ring;
            p.vx = -ny * omega * ring;
            p.vy = nx * omega * ring;
        }
        else if (p.stem < hold + 0.55) {
            let ang = Math.atan2(dy, dx);
            if (d < 1e-4)
                ang = 0.7;
            const exitAng = 0.72;
            let da = exitAng - ang;
            while (da > Math.PI)
                da -= Math.PI * 2;
            while (da < -Math.PI)
                da += Math.PI * 2;
            ang += Math.sign(da) * Math.min(Math.abs(da), 5 * dt);
            const ring = 64 + (p.stem - hold) * 48;
            p.x = sw.x + Math.cos(ang) * ring;
            p.y = sw.y + Math.sin(ang) * ring;
            p.vx = Math.cos(exitAng) * 190;
            p.vy = Math.sin(exitAng) * 190;
        }
    }
}
export function updateWorld(world: World, dt: number): void {
    const clamped = Math.min(dt, 1 / 24);
    world.time += clamped;
    if (false) {
    }
    {
    }
    {
    }
    {
    }
    {
    }
    if (world.stage === "wash")
        prepareWashDrive(world, clamped);
    solveSpin(world.gears);
    driveFreeBelts(world, clamped);
    applyBelts(world, clamped);
    prepareBeltGearContacts(world);
    solveConfiguredTransmission(world, clamped, true, beltGearSourceGears(world));
    for (const g of world.gears)
        if (!usesConfiguredSubsteps(world, g))
            g.angle += g.omega * clamped;
    if (world.stage === "wash")
        updateWash(world, clamped);
    if (stageHasRecvTruck(world.stage))
        updateRecvTruck(world, clamped);
    updateGates(world, clamped);
    if (world.stage !== "wash") {
        world.drum.angle += world.drum.omega * clamped;
    }
    world.spawnAcc += clamped;
    if (world.stage === "sewer") {
        if (world.spawnAcc > 0.12) {
            world.spawnAcc = 0;
            spawnSewerWater(world);
        }
    }
    else if (world.stage === "free") {
        if (world.spawnAcc > 0.7) {
            world.spawnAcc = 0;
            spawnFreeBall(world);
        }
    }
    else {
        world.spawnAcc = 0;
    }
    const h = clamped / SUBSTEPS;
    const tops = crawlerTops(world);
    for (let i = 0; i < SUBSTEPS; i++) {
        advanceConfiguredMotors(world, h);
        if (world.stage === "sewer")
            applySewerFlow(world, h);
        if (world.stage === "wash")
            applyWashForces(world, h);
        applyBlowers(world, h);
        stepPhysics(world, h, tops);
        applyBeltGearContacts(world, h);
        finishConfiguredStep(world, h);
    }
    {
    }
    if (world.stage === "sewer") {
        conveySwirl(world, clamped);
    }
    for (const p of world.particles) {
    }
    if (stageHasRecvTruck(world.stage))
        applyRecvTruckCargo(world);
    cull(world);
    if (world.stage === "sandbox")
        updateSandbox(world, clamped);
}
