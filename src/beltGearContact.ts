import type { Gear, Segment, World } from "./model";
import { applyBallAngularImpulse, applyBeltImpulse, ballContactInertia, beltContactBody, gearContactToken, spinsMesh } from "./spin";
import { freeBeltPlacementAllowed, freeBeltSnap } from "./freeBelt";

export const BELT_GEAR_NORMAL_FORCE = 120; // Bearing preload, not simulated translation.
export const BELT_GEAR_FRICTION = 0.8;
export const BELT_GEAR_RESPONSE = 25;
// Provisional play-test tuning: new motor gears against user-placed crawlers
// only. Free belts, follower contacts and factory machinery keep their ratings.
export const PLACED_CRAWLER_MOTOR_TRACTION = 2880;
export const PLACED_CRAWLER_MOTOR_RESPONSE = 200;
export const BELT_GEAR_CONTACT_SKIN = 0.5;
export const OUTER_BELT_SNAP_RANGE = 12;
// Approach tolerance only: the committed disk is always tangent, never sunk
// into the belt. Keep the distant attraction range unchanged.
export const OUTER_BELT_SNAP_OVERLAP = 12;
type Contact = { gear: Gear; segment: Segment; lever: number; key: string };
type PlacementGear = Pick<Gear, "x" | "y" | "r"> & Partial<Pick<Gear, "motorKind" | "frictionContact" | "motorFrictionContact">>;
const caches = new WeakMap<World, { signature: string; contacts: Contact[] }>();

function inside(points: { x: number; y: number }[], g: Gear): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > g.y) !== (b.y > g.y) && g.x < (b.x - a.x) * (g.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Shared narrow phase for placement and simulation. Does not move the gear. */
function singleSurfaceContact(world: World, g: Gear, surfaces: Segment[]): Contact | undefined {
    const candidates: Contact[] = [];
    for (const s of surfaces) {
      const dx = s.bx - s.ax, dy = s.by - s.ay, len = Math.hypot(dx, dy); if (len < 1e-5) continue;
      const along = ((g.x - s.ax) * dx + (g.y - s.ay) * dy) / len;
      const t = Math.max(0, Math.min(1, along / len));
      const rx = s.ax + t * dx - g.x, ry = s.ay + t * dy - g.y, d = Math.hypot(rx, ry);
      const halfWidth = s.freeBelt !== undefined ? 5 : 0.9;
      if (Math.abs(d - g.r - halfWidth) > BELT_GEAR_CONTACT_SKIN + 1e-8) continue;
      // Any endpoint contact makes this placement ambiguous, not a friction roller.
      if (along < 6 || along > len - 6) { candidates.push({ gear: g, segment: s, lever: 0, key: "ambiguous" }); continue; }
      if (s.freeBelt !== undefined) {
        const loop = world.freeBelts?.find(b => b.id === s.freeBelt);
        if (!loop || inside(loop.points, g) || loop.contacts?.some(c => c.gearId === g.id)) continue;
      }
      candidates.push({ gear: g, segment: s, lever: (rx * dy - ry * dx) / (d * len) * g.r,
        key: s.freeBelt !== undefined ? `free:${s.freeBelt}` : `belt:${s.belt}` });
    }
    return candidates.length === 1 && candidates[0].key !== "ambiguous" ? candidates[0] : undefined;
}

/** Keep the old overlap rule except for an enabled, unambiguous outer contact.
 * Check every loop, so touching one belt never permits penetration of another. */
export function gearPlacementAllowed(world: World, p: PlacementGear): boolean {
  const enabled = p.frictionContact !== false && (p.motorKind === "follower" ||
    (p.motorKind === "motor" && p.motorFrictionContact !== false));
  // New friction gears may approach a crawler surface deeply, but only the
  // resolved tangent disk may be committed. Preserve ordinary gear meshing.
  if (enabled && !world.gears.some(g => spinsMesh(p as Gear, g))) {
    for (const s of world.segments) {
      if (!s.placed || !s.belt || s.freeBelt !== undefined) continue;
      const dx = s.bx - s.ax, dy = s.by - s.ay, length2 = dx * dx + dy * dy;
      if (length2 < 1e-8) continue;
      const t = Math.max(0, Math.min(1, ((p.x - s.ax) * dx + (p.y - s.ay) * dy) / length2));
      if (Math.hypot(p.x - s.ax - t * dx, p.y - s.ay - t * dy) < p.r + 0.9 - BELT_GEAR_CONTACT_SKIN - 1e-8) return false;
    }
  }
  if (freeBeltPlacementAllowed(world, p, p.r)) return true;
  if (!enabled || !freeBeltPlacementAllowed(world, p, p.r, BELT_GEAR_CONTACT_SKIN)) return false;
  const probe = { ...p, id: -1 } as Gear;
  return !!singleSurfaceContact(world, probe, world.segments.filter(s => s.placed && (s.freeBelt !== undefined || s.belt)));
}

/** UI-only approach aid. Physics still uses the exact existing contact surface.
 * Never rescue a deep overlap, pick between two faces, or move a meshing gear. */
export function outerBeltSnap(world: World, p: PlacementGear): { x: number; y: number; point: { x: number; y: number }; normal: { x: number; y: number }; supported: boolean } | null {
  const enabled = p.frictionContact !== false && (p.motorKind === "follower" ||
    (p.motorKind === "motor" && p.motorFrictionContact !== false));
  if (!enabled) return null;
  // Preserve real meshing, but do not treat a temporarily overlapping approach
  // pose as a connection before checking its corrected outer position.
  if (world.gears.some(g => spinsMesh(p as Gear, g)) &&
    freeBeltPlacementAllowed(world, p, p.r, BELT_GEAR_CONTACT_SKIN)) return null;
  const surfaces = world.segments.filter(s => s.placed && (s.freeBelt !== undefined || s.belt));
  const candidates: { segment: Segment; x: number; y: number; point: { x: number; y: number }; normal: { x: number; y: number }; valid: boolean }[] = [];
  for (const s of surfaces) {
    const dx = s.bx - s.ax, dy = s.by - s.ay, len = Math.hypot(dx, dy);
    if (len < 1e-5) continue;
    if (s.freeBelt !== undefined) {
      const loop = world.freeBelts?.find(b => b.id === s.freeBelt);
      if (!loop || inside(loop.points, p as Gear)) continue;
    } else {
      // A regular crawler is a capsule; its interior is not an outer approach.
      const rollers = world.gears.filter(g => g.belt === s.belt && g.spin === "roller");
      if (rollers.length !== 2) continue;
      const [a, b] = rollers, ax = b.x - a.x, ay = b.y - a.y, length2 = ax * ax + ay * ay;
      if (length2 < 1e-8) continue;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * ax + (p.y - a.y) * ay) / length2));
      if (Math.hypot(p.x - a.x - t * ax, p.y - a.y - t * ay) < a.r) continue;
    }
    const along = ((p.x - s.ax) * dx + (p.y - s.ay) * dy) / len;
    const t = Math.max(0, Math.min(1, along / len));
    const point = { x: s.ax + t * dx, y: s.ay + t * dy };
    const d = Math.hypot(p.x - point.x, p.y - point.y), target = p.r + (s.freeBelt !== undefined ? 5 : 0.9);
    const gap = d - target;
    if (d < 1e-8 || gap < -OUTER_BELT_SNAP_OVERLAP - 1e-8 || gap > OUTER_BELT_SNAP_RANGE + 1e-8) continue;
    const normal = { x: (p.x - point.x) / d, y: (p.y - point.y) / d };
    candidates.push({ segment: s, x: point.x + normal.x * target, y: point.y + normal.y * target, point, normal,
      valid: along >= 6 && along <= len - 6 });
  }
  const legal = candidates.filter(candidate => {
    // Keep the existing crawler approach rule. For hand-drawn free belts an
    // adjacent endpoint may be nearby only BEFORE the tangent correction.
    if (!candidate.valid || (candidate.segment.freeBelt === undefined && candidates.length !== 1)) return false;
    const probe = { ...p, x: candidate.x, y: candidate.y, id: -1 } as Gear;
    if (world.gears.some(g => spinsMesh(probe, g) || Math.hypot(probe.x - g.x, probe.y - g.y) < probe.r + g.r - 1e-8) ||
      !gearPlacementAllowed(world, probe)) return false;
    // The selected face must not pull the disk through a different belt surface.
    for (const s of surfaces) {
      const dx = s.bx - s.ax, dy = s.by - s.ay, length2 = dx * dx + dy * dy;
      if (length2 < 1e-8) continue;
      const t = Math.max(0, Math.min(1, ((probe.x - s.ax) * dx + (probe.y - s.ay) * dy) / length2));
      const distance = Math.hypot(probe.x - s.ax - t * dx, probe.y - s.ay - t * dy);
      if (distance < p.r + (s.freeBelt !== undefined ? 5 : 0.9) - BELT_GEAR_CONTACT_SKIN - 1e-8) return false;
    }
    return singleSurfaceContact(world, probe, surfaces)?.segment === candidate.segment;
  });
  if (legal.length !== 1) return null;
  const candidate = legal[0];
  const loop = world.freeBelts?.find(b => b.id === candidate.segment.freeBelt);
  return { ...candidate, supported: candidate.segment.freeBelt === undefined || (loop?.contacts?.length ?? 0) >= 2 };
}

/** Used identically for initial preview, pointermove and pointerup. */
export function resolveGearPlacement(world: World, p: PlacementGear): { x: number; y: number } {
  const snap = freeBeltSnap(world, p, p.r) ?? outerBeltSnap(world, p);
  return snap ? { x: snap.x, y: snap.y } : { x: p.x, y: p.y };
}

/** Cached broad phase: no geometry edits, snaps, or graph links. */
export function prepareBeltGearContacts(world: World): Contact[] {
  const gears = world.gears.filter(g => g.placed && (g.motorKind === "follower" || (g.motorKind === "motor" && g.motorFrictionContact === true)) && g.frictionContact === true && !g.belt &&
    !world.freeBelts?.some(b => b.contacts?.some(c => c.gearId === g.id)));
  const surfaces = world.segments.filter(s => s.placed && (s.freeBelt !== undefined || s.belt));
  const signature = gears.map(g => `${g.id},${g.x},${g.y},${g.r}`).join(";") + "|" + surfaces.map(s => `${s.ax},${s.ay},${s.bx},${s.by},${s.freeBelt},${s.belt}`).join(";");
  const old = caches.get(world);
  if (old?.signature === signature) return old.contacts;
  const cell = 96, pad = Math.max(0, ...gears.map(g => g.r)) + 6, grid = new Map<string, Segment[]>();
  for (const s of surfaces) for (let x = Math.floor((Math.min(s.ax, s.bx) - pad) / cell); x <= Math.floor((Math.max(s.ax, s.bx) + pad) / cell); x++)
    for (let y = Math.floor((Math.min(s.ay, s.by) - pad) / cell); y <= Math.floor((Math.max(s.ay, s.by) + pad) / cell); y++) {
      const key = `${x},${y}`, bucket = grid.get(key) ?? []; bucket.push(s); grid.set(key, bucket);
    }
  const contacts: Contact[] = [];
  for (const g of gears) {
    const contact = singleSurfaceContact(world, g, grid.get(`${Math.floor(g.x / cell)},${Math.floor(g.y / cell)}`) ?? []);
    if (contact) contacts.push(contact);
  }
  caches.set(world, { signature, contacts }); return contacts;
}

export function applyBeltGearContacts(world: World, dt: number): void {
  for (const c of caches.get(world)?.contacts ?? prepareBeltGearContacts(world)) {
    if (!world.gears.includes(c.gear) || !world.segments.includes(c.segment)) continue;
    const body = beltContactBody(world, c.key), token = gearContactToken(world, c.gear);
    if (!body || !token || token === body.network) continue;
    const loop = c.segment.freeBelt === undefined ? undefined : world.freeBelts?.find(b => b.id === c.segment.freeBelt);
    if (loop?.contacts?.some(contact => contact.gearId === c.gear.id)) continue;
    const inverseMass = c.lever ** 2 / ballContactInertia(world, c.gear) + body.ratio ** 2 / body.network.inertia;
    const slip = c.gear.omega * c.lever - body.speed();
    const placedCrawlerMotor = c.gear.motorKind === "motor" && c.segment.placed &&
      c.segment.belt !== undefined && c.segment.freeBelt === undefined;
    const response = placedCrawlerMotor ? PLACED_CRAWLER_MOTOR_RESPONSE : BELT_GEAR_RESPONSE;
    const traction = placedCrawlerMotor ? PLACED_CRAWLER_MOTOR_TRACTION : BELT_GEAR_NORMAL_FORCE * BELT_GEAR_FRICTION;
    const desired = -slip * (1 - Math.exp(-response * Math.max(0, dt))) / inverseMass;
    const limit = traction * Math.max(0, dt);
    const impulse = Math.max(-limit, Math.min(limit, desired));
    applyBallAngularImpulse(world, c.gear, c.lever * impulse);
    applyBeltImpulse(world, body, -impulse);
  }
}

/** A legacy source is opted into reaction only when a NEW enabled receiver
 * actually touches it; merely loading an old scene never changes its solver. */
export function beltGearSourceGears(world: World): Set<number> {
  const ids = new Set<number>();
  for (const c of caches.get(world)?.contacts ?? []) {
    if (c.segment.freeBelt !== undefined) {
      const loop = world.freeBelts?.find(b => b.id === c.segment.freeBelt);
      for (const contact of loop?.contacts ?? []) ids.add(contact.gearId);
    } else for (const gear of world.gears) if (gear.belt === c.segment.belt) ids.add(gear.id);
  }
  return ids;
}
