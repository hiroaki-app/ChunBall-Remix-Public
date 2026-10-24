import { MIN_PLACED_BELT_LEN, type Particle, type Segment, type World } from "./model";

type Point = { x: number; y: number };
export type CrawlerTop = { segment: Segment; ux: number; uy: number; nx: number; ny: number; length: number };

/** Only the straight, upward-facing side of a user crawler. Caps and factory
 * surfaces remain on their existing collision paths. Prepared once per frame. */
export function crawlerTops(world: World): Map<Segment, CrawlerTop> {
  const tops = new Map<Segment, CrawlerTop>();
  for (const s of world.segments) {
    if (!s.placed || !s.belt || s.freeBelt !== undefined) continue;
    const dx = s.bx - s.ax, dy = s.by - s.ay, length = Math.hypot(dx, dy);
    if (length < MIN_PLACED_BELT_LEN - 1e-6) continue;
    const ux = dx / length, uy = dy / length;
    let nx = -uy, ny = ux;
    if (ny > 0) { nx = -nx; ny = -ny; }
    if (ny >= -0.25) continue; // No vertical/underside adhesion.
    const roller = world.gears.find(g => g.placed && g.spin === "roller" && g.belt === s.belt);
    if (!roller || Math.abs((s.ax - roller.x) * nx + (s.ay - roller.y) * ny - roller.r) > 1e-5) continue;
    tops.set(s, { segment: s, ux, uy, nx, ny, length });
  }
  return tops;
}

/** Rescue a centre that crossed a zero-width top during this substep, not an
 * already embedded ball. Return the swept-circle contact, without any impulse;
 * collideSegment supplies the one normal/friction/reaction response. */
export function sweepCrawlerTop(p: Particle, previous: Point, top: CrawlerTop): Point | undefined {
  const { segment: s, ux, uy, nx, ny, length } = top;
  const oldDistance = (previous.x - s.ax) * nx + (previous.y - s.ay) * ny;
  const distance = (p.x - s.ax) * nx + (p.y - s.ay) * ny;
  if (oldDistance < p.r - 1e-6 || distance > 0 || p.vx * nx + p.vy * ny >= 0) return;
  const change = oldDistance - distance;
  if (change <= 1e-8) return;
  const t = Math.max(0, (oldDistance - p.r) / change);
  if (t > 1) return;
  const x = previous.x + (p.x - previous.x) * t;
  const y = previous.y + (p.y - previous.y) * t;
  const along = (x - s.ax) * ux + (y - s.ay) * uy;
  const endAlong = (p.x - s.ax) * ux + (p.y - s.ay) * uy;
  const margin = p.r + 1;
  if (along <= margin || along >= length - margin || endAlong <= margin || endAlong >= length - margin) return;
  // A microscopic penetration invokes the existing solver's normal branch,
  // which projects back to exactly r and applies its usual restitution once.
  return { x: x - nx * 1e-6, y: y - ny * 1e-6 };
}
