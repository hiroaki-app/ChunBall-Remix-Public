import { BALL_MASS, type World, type Segment } from "./model";
import { beltContactBody, applyBeltImpulse } from "./spin";

export const BELT_CONTACT_FRICTION = 2.5;
export const BELT_CONTACT_RESPONSE = 35;

/** Tangential impulse only: position correction and normal collision stay in sim.
 * One traction contact per ball/network/substep prevents seam and gear duplication. */
export function beltFriction(world: World, segment: Segment, vt: number,
  normalImpulse: number, tangentProjection: number, dt: number, claimed: Set<object>): number | undefined {
  const key = segment.freeBelt !== undefined ? `free:${segment.freeBelt}` : `belt:${segment.belt}`;
  const body = beltContactBody(world, key);
  if (!body) return undefined;
  if (claimed.has(body.network)) return vt;
  const b = body.ratio * tangentProjection;
  const inverseMass = 1 / BALL_MASS + b * b / body.network.inertia;
  const slip = vt - body.speed() * tangentProjection;
  const limit = BELT_CONTACT_FRICTION * Math.max(0, normalImpulse);
  const desired = -slip * (1 - Math.exp(-BELT_CONTACT_RESPONSE * Math.max(0, dt))) / inverseMass;
  const impulse = Math.max(-limit, Math.min(limit, desired));
  if (Math.abs(impulse) > 1e-12) {
    claimed.add(body.network);
    applyBeltImpulse(world, body, -impulse * tangentProjection);
  }
  return vt + impulse / BALL_MASS;
}
