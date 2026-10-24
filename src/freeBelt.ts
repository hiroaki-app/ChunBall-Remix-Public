import { H, MAX_PLACED_SEGS, W, type Vec, type World } from "./model";
import { spinsMesh } from "./spin";

export const FREE_BELT_CLOSE_R = 24;
export const FREE_BELT_MAX_POINTS = 192;
export type BeltContact = { gearId: number; point: Vec; normal: Vec; since: number };
export type FreeBelt = { id: number; points: Vec[]; length: number; contacts?: BeltContact[]; speed?: number; travel?: number; conflicted?: boolean };
export type BeltSnap = { beltId: number; x: number; y: number; point: Vec; normal: Vec };

function inside(points: Vec[], p: Vec): boolean {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
function nearest(points: Vec[], p: Vec): { point: Vec; distance: number } {
  let best = { point: points[0], distance: Infinity };
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    const point = { x: a.x + dx * t, y: a.y + dy * t }, d = distance(p, point);
    if (d < best.distance) best = { point, distance: d };
  }
  return best;
}

export function freeBeltPlacementAllowed(world: World, p: Vec, r: number, contactSkin = 0.01): boolean {
  return (world.freeBelts ?? []).every(b => nearest(b.points, p).distance >= r + 5 - contactSkin - 1e-8);
}

/** Snap only from inside; verify the entire disk, including other nearby edges. */
export function freeBeltSnap(world: World, p: Vec, r: number, tolerance = 12): BeltSnap | null {
  let best: BeltSnap | null = null, bestGap = Infinity;
  for (const belt of world.freeBelts ?? []) {
    if (!inside(belt.points, p)) continue;
    const hit = nearest(belt.points, p), gap = Math.abs(hit.distance - (r + 5));
    if (hit.distance < 1 || gap > tolerance || gap >= bestGap) continue;
    const normal = { x: (p.x - hit.point.x) / hit.distance, y: (p.y - hit.point.y) / hit.distance };
    const center = { x: hit.point.x + normal.x * (r + 5), y: hit.point.y + normal.y * (r + 5) };
    if (!inside(belt.points, center) || nearest(belt.points, center).distance < r + 5 - 0.01) continue;
    // Do not snap a disk through another part of this or another loop.
    if ((world.freeBelts ?? []).some(b => nearest(b.points, center).distance < r + 5 - 0.01)) continue;
    best = { beltId: belt.id, ...center, point: hit.point, normal }; bestGap = gap;
  }
  return best;
}

/** Connections are geometric, never modify gear drive/mesh or belt geometry. */
export function syncFreeBeltContacts(world: World): void {
  for (const b of world.freeBelts ?? []) {
    const old = b.contacts ?? [];
    b.contacts = [];
    for (const g of world.gears) {
      if (!g.placed || g.spin !== "gear" || g.belt || !inside(b.points, g) || !freeBeltPlacementAllowed(world, g, g.r)) continue;
      const hit = nearest(b.points, g);
      if (Math.abs(hit.distance - (g.r + 5)) > 0.5) continue;
      b.contacts.push({ gearId: g.id, point: hit.point, normal: { x: (g.x - hit.point.x) / hit.distance, y: (g.y - hit.point.y) / hit.distance }, since: old.find(c => c.gearId === g.id)?.since ?? world.time });
    }
  }
}
export type LoopResult = { points: Vec[]; length: number } | { error: string };

/** Solve only connected free-belt groups; retain the ordinary mesh solver elsewhere. */
export function driveFreeBelts(world: World, dt: number): void {
  syncFreeBeltContacts(world);
  const gears = world.gears, belts = world.freeBelts ?? [], n = gears.length;
  if (!belts.length) return;
  const adj: { to: number; ratio: number }[][] = Array.from({ length: n + belts.length }, () => []);
  const link = (a: number, b: number, ratio: number) => {
    adj[a].push({ to: b, ratio }); adj[b].push({ to: a, ratio: 1 / ratio });
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (spinsMesh(gears[i], gears[j])) link(i, j, -gears[i].r / gears[j].r);
  for (let i = 0; i < belts.length; i++) {
    const b = belts[i]; b.speed = 0; b.conflicted = false;
    if ((b.contacts?.length ?? 0) < 2) continue;
    for (const c of b.contacts!) {
      const index = gears.findIndex(g => g.id === c.gearId);
      const hit = nearestEdgeTangent(b.points, c.point);
      // Screen-space positive angular velocity is clockwise.
      const sign = c.normal.y * hit.x - c.normal.x * hit.y;
      if (index >= 0 && Math.abs(sign) > 0.99) link(index, n + i, gears[index].r * Math.sign(sign));
    }
  }
  const seen = new Set<number>();
  for (let start = n; start < adj.length; start++) {
    if (!adj[start].length || seen.has(start)) continue;
    const ratios = new Map<number, number>([[start, 1]]), queue = [start];
    let conflict = false, speed: number | undefined, driver = -1;
    for (let k = 0; k < queue.length; k++) {
      const u = queue[k]; seen.add(u);
      for (const e of adj[u]) {
        const value = ratios.get(u)! * e.ratio;
        if (ratios.has(e.to)) {
          if (Math.abs(ratios.get(e.to)! - value) > 1e-6 * Math.max(1, Math.abs(value))) conflict = true;
        } else { ratios.set(e.to, value); queue.push(e.to); }
      }
    }
    for (const u of queue) if (u < n && gears[u].drive !== 0) {
      const want = gears[u].drive / Math.max(10, gears[u].r) / ratios.get(u)!;
      // Motor magnitudes are nominal (size presets differ). Opposite demands
      // are contradictory; compatible motors follow the existing priority rule.
      if (speed !== undefined && Math.sign(speed) !== Math.sign(want)) conflict = true;
      if (driver < 0 || gears[u].drivePriority > gears[driver].drivePriority ||
        (gears[u].drivePriority === gears[driver].drivePriority && gears[u].driveSeq > gears[driver].driveSeq)) {
        driver = u; speed = want;
      }
    }
    const value = conflict ? 0 : speed ?? 0;
    for (const u of queue) {
      if (u < n) gears[u].omega = value * ratios.get(u)!;
      else { belts[u - n].speed = value * ratios.get(u)!; belts[u - n].conflicted = conflict; }
    }
  }
  for (const b of belts) {
    b.travel = ((b.travel ?? 0) + (b.speed ?? 0) * dt) % b.length;
    for (const s of world.segments) if (s.freeBelt === b.id) s.conveyor = b.speed ?? 0;
  }
}

function nearestEdgeTangent(points: Vec[], p: Vec): Vec {
  let best = Infinity, tangent = { x: 0, y: 0 };
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], len = distance(a, b);
    const d = nearest([a, b], p).distance;
    if (d < best) { best = d; tangent = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }; }
  }
  return tangent;
}

const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: Vec, b: Vec, c: Vec) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function onSegment(a: Vec, b: Vec, p: Vec): boolean {
  return Math.abs(cross(a, b, p)) < 1e-6 && p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6 && p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6;
}
function intersects(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

/** Saved/collider points are authoritative: never smooth again when loading. */
export function validateFreeLoop(points: Vec[]): LoopResult {
  if (points.length < 3 || points.length > FREE_BELT_MAX_POINTS) return { error: "輪の点が少なすぎるか、多すぎます" };
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > W || p.y < 0 || p.y > H)) return { error: "画面内に輪を描いてください" };
  let length = 0, area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const edge = distance(a, b);
    if (edge < 2) return { error: "輪に短すぎる折り返しがあります" };
    length += edge;
    area += a.x * b.y - a.y * b.x;
    const prev = points[(i + points.length - 1) % points.length];
    const ux = prev.x - a.x, uy = prev.y - a.y, vx = b.x - a.x, vy = b.y - a.y;
    if ((ux * vx + uy * vy) / (distance(prev, a) * edge) > 0.98) return { error: "鋭すぎる折り返しがあります" };
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) return { error: "線が交差しています" };
    }
  }
  if (length < 120 || Math.abs(area) / 2 < 800) return { error: "輪が小さすぎるか、細すぎます" };
  return { points: points.map(p => ({ ...p })), length };
}

export function prepareFreeLoop(raw: Vec[]): LoopResult {
  if (raw.length < 4) return { error: "もう少し大きな輪を描いてください" };
  if (raw.length > 1024) return { error: "線が長すぎます" };
  if (distance(raw[0], raw[raw.length - 1]) > FREE_BELT_CLOSE_R) return { error: "始点の丸まで戻って輪を閉じてください" };
  // Reject crossings before simplification can accidentally hide them.
  for (let i = 0; i < raw.length - 1; i++) for (let j = i + 2; j < raw.length - 1; j++) {
    if (i === 0 && j === raw.length - 2 && distance(raw[0], raw[raw.length - 1]) < 2) continue;
    if (intersects(raw[i], raw[i + 1], raw[j], raw[j + 1])) return { error: "線が交差しています" };
  }
  const points: Vec[] = [raw[0]];
  for (const p of raw.slice(1)) if (distance(points[points.length - 1], p) >= 6) points.push(p);
  if (distance(points[0], points[points.length - 1]) <= 6) points.pop();
  // Remove only almost-straight jitter (at most 1.5 world pixels per point).
  for (let i = points.length - 1; i > 0 && points.length > 3; i--) {
    const a = points[i - 1], b = points[i], c = points[(i + 1) % points.length];
    const ac = distance(a, c);
    if (ac > 0 && Math.abs(cross(a, c, b)) / ac < 1.5 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0) points.splice(i, 1);
  }
  return validateFreeLoop(points);
}

export function addFreeBelt(world: World, points: Vec[]): string | null {
  const result = validateFreeLoop(points);
  if ("error" in result) return result.error;
  if (world.segments.filter(s => s.placed).length + points.length > MAX_PLACED_SEGS) return "配置できる線の数が上限です";
  const id = world.nextId++;
  (world.freeBelts ??= []).push({ id, points: result.points, length: result.length });
  for (let i = 0; i < result.points.length; i++) {
    const a = result.points[i], b = result.points[(i + 1) % result.points.length];
    world.segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, conveyor: 0, placed: true, draw: false, pass: "all", freeBelt: id, belt: `free:${id}` });
  }
  syncFreeBeltContacts(world);
  return null;
}
