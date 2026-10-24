import { BALL_MASS, type Gear, type Particle, type World } from "./model";
import { acceptsBallImpulse, motorCharacteristics, ballContactInertia, applyBallAngularImpulse, gearContactToken, MOTOR_CONTACT_UNIT } from "./spin";

/** Convert motor inertia to mass * pixel² without changing its torque/inertia ratio. */
export function contactInertia(radius: number): number {
  return motorCharacteristics(radius).inertia * MOTOR_CONTACT_UNIT;
}

/** Equal-and-opposite friction impulse at the existing circular gear boundary.
 * No tooth geometry, adhesion or animation torque. */
export function collideIndependentFollower(world: World, p: Particle, g: Gear, claimed?: Set<object>): boolean {
  if (!acceptsBallImpulse(world, g)) return false;
  const dx = p.x - g.x, dy = p.y - g.y, distance = Math.hypot(dx, dy);
  const radius = g.r * 0.92, boundary = radius + p.r;
  if (distance < 1e-5 || distance > boundary) return true;
  const nx = dx / distance, ny = dy / distance;
  p.x += nx * (boundary - distance);
  p.y += ny * (boundary - distance);
  const normalSpeed = p.vx * nx + p.vy * ny;
  if (normalSpeed >= 0) return true;
  const normalImpulse = -(1 + 0.2) * normalSpeed * BALL_MASS;
  const tx = -ny, ty = nx, inertia = ballContactInertia(world, g);
  const slip = p.vx * tx + p.vy * ty - g.omega * radius;
  const required = -slip / (1 / BALL_MASS + radius * radius / inertia);
  const limit = 0.35 * normalImpulse;
  const token = gearContactToken(world, g)!;
  const tangentImpulse = claimed?.has(token) ? 0 : Math.max(-limit, Math.min(limit, required));
  p.vx += (normalImpulse * nx + tangentImpulse * tx) / BALL_MASS;
  p.vy += (normalImpulse * ny + tangentImpulse * ty) / BALL_MASS;
  applyBallAngularImpulse(world, g, -radius * tangentImpulse);
  if (Math.abs(tangentImpulse) > 1e-12) claimed?.add(token);
  return true;
}
