import { BLOWER_CONE, BLOWER_FORCE, BLOWER_RANGE, type Blower, type Particle, type World, } from "./model";
/** Shared wind impulse for factory + user-placed blowers. */
export function applyBlowers(world: World, dt: number): void {
    for (const b of world.blowers) {
        for (const p of world.particles) {
            if (p.frozen || p.standing)
                continue;
            if (p.kind !== "grain" && p.kind !== "other")
                continue;
            applyBlowerToParticle(b, p, dt, world.time);
        }
    }
}
export function applyBlowerToParticle(b: Blower, p: Particle, dt: number, time: number): void {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2 || dist > b.range)
        return;
    const ang = Math.atan2(dy, dx);
    let da = ang - b.angle;
    while (da > Math.PI)
        da -= Math.PI * 2;
    while (da < -Math.PI)
        da += Math.PI * 2;
    if (Math.abs(da) > b.cone)
        return;
    const falloff = 1 - dist / b.range;
    const strength = b.force * falloff * falloff;
    p.vx += Math.cos(b.angle) * strength * dt;
    p.vy += Math.sin(b.angle) * strength * dt;
}
export function makeBlower(id: number, x: number, y: number, opts: Partial<Omit<Blower, "id" | "x" | "y">> = {}): Blower {
    return {
        id,
        x,
        y,
        angle: opts.angle ?? 0,
        range: opts.range ?? BLOWER_RANGE,
        force: opts.force ?? BLOWER_FORCE,
        cone: opts.cone ?? BLOWER_CONE,
        placed: opts.placed ?? false,
        mode: opts.mode ?? "planar",
    };
}
