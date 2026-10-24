import type { Gear, World } from "./model";
/** Torque and inertia share this conversion to mass·pixel² units.
 * Independent of ball mass: changing BALL_MASS must actually change load.
 * The unit conversion scales torque/inertia together; motor rating is separate. */
export const MOTOR_CONTACT_UNIT = 2 * 28 ** 2;
export const PLACED_MOTOR_TORQUE_SCALE = 4;

/** Pitch circles must nearly touch. Nearby-but-not-meshing does not connect. */
export const MESH_SLACK = 7;

export function spinsMesh(a: Gear, b: Gear): boolean {
  // The washer's two output gears stay independent until the saw is actually
  // driving or being driven. A placed gear still meshes either one.
  if (a.washBuiltIn && b.washBuiltIn && !(a.washLinked && b.washLinked)) return false;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const want = a.r + b.r;
  return d > 8 && Math.abs(d - want) <= MESH_SLACK;
}

export function solveSpin(gears: Gear[]): void {
  const n = gears.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!spinsMesh(gears[i], gears[j])) continue;
      adj[i].push(j);
      adj[j].push(i);
    }
  }

  const omega: number[] = new Array(n).fill(0);
  const seen = new Array(n).fill(false);

  for (let start = 0; start < n; start++) {
    if (seen[start]) continue;
    const comp: number[] = [];
    const stack = [start];
    seen[start] = true;
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const v of adj[u]) {
        if (!seen[v]) {
          seen[v] = true;
          stack.push(v);
        }
      }
    }

    let driver = comp[0];
    for (const i of comp) {
      const a = gears[i];
      const b = gears[driver];
      if (
        a.drivePriority > b.drivePriority ||
        (a.drivePriority === b.drivePriority && a.driveSeq > b.driveSeq) ||
        (a.drivePriority === b.drivePriority &&
          a.driveSeq === b.driveSeq &&
          Math.abs(a.drive) > Math.abs(b.drive)) ||
        (a.drivePriority === b.drivePriority &&
          a.driveSeq === b.driveSeq &&
          Math.abs(a.drive) === Math.abs(b.drive) &&
          a.id > b.id)
      ) {
        driver = i;
      }
    }

    omega[driver] = gears[driver].drive / Math.max(10, gears[driver].r);
    const q = [driver];
    const vis = new Set<number>([driver]);
    while (q.length) {
      const u = q.shift()!;
      for (const v of adj[u]) {
        if (vis.has(v)) continue;
        vis.add(v);
        omega[v] = (-omega[u] * gears[u].r) / gears[v].r;
        q.push(v);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    gears[i].omega = omega[i];
  }
}

export function applyBelts(world: World, dt: number): void {
  for (const belt of world.belts) {
    const nodes = world.gears.filter((g) => g.belt === belt.id);
    let best = 0;
    for (const n of nodes) {
      if (Math.abs(n.omega) > Math.abs(best)) best = n.omega;
    }
    belt.speed = best * belt.outerR;
    for (const n of nodes) n.omega = best;
    for (const s of world.segments) {
      if (s.belt === belt.id) s.conveyor = belt.speed;
    }
    belt.travel += belt.speed * dt;
  }
}

/** Game-unit, no-load motor parameters. Radius sets motor rating, not gear ratio. */
export function motorCharacteristics(r: number): { maxTorque: number; inertia: number; gain: number } {
  const scale = Math.max(10, r) / 28;
  const maxTorque = 16 * scale * scale;
  return { maxTorque, inertia: Math.max(0.05, scale ** 4), gain: maxTorque / 2.2 };
}

// Runtime only: restored/new gears start at rest; removed entities aren't retained.
const transmissionSpeeds = new WeakMap<World, Map<Gear, number>>();
type Motor = { ratio: number; target: number; gain: number; maxTorque: number };
type PassiveNetwork = { inertia: number; ratios: Map<Gear, number>; outputs: { ratio: number; set: (speed: number) => void; travel?: (distance: number) => void }[]; motors?: Motor[]; loaded?: boolean };
const passiveNetworks = new WeakMap<World, Map<Gear, PassiveNetwork>>();
const substepNetworks = new WeakMap<World, PassiveNetwork[]>();

function advanceSpeed(speed: number, inertia: number, motors: Motor[], dt: number, power = 1): number {
  if (!motors.length) return Math.abs(speed) < 1e-5 ? 0 : speed * Math.exp(-1.2 * dt);
  const steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps;
  for (let k = 0; k < steps; k++) {
    let torque = 0;
    for (const m of motors) torque += m.ratio * m.maxTorque * power * Math.tanh(m.gain * (m.target - m.ratio * speed) / m.maxTorque);
    speed += torque / Math.max(1e-8, inertia) * h;
  }
  return speed;
}

export function advanceConfiguredMotors(world: World, dt: number): void {
  for (const net of substepNetworks.get(world) ?? []) {
    const [g, ratio] = net.ratios.entries().next().value!;
    const speed = advanceSpeed(g.omega / ratio, net.inertia / MOTOR_CONTACT_UNIT, net.motors!, dt, net.loaded ? PLACED_MOTOR_TORQUE_SCALE : 1);
    net.loaded = false;
    applyNetworkImpulse(world, net, speed);
  }
}

export function finishConfiguredStep(world: World, dt: number): void {
  for (const net of substepNetworks.get(world) ?? []) {
    const [g, ratio] = net.ratios.entries().next().value!;
    const speed = g.omega / ratio;
    for (const gear of net.ratios.keys()) gear.angle += gear.omega * dt;
    for (const out of net.outputs) out.travel?.(speed * out.ratio * dt);
  }
}

export function usesConfiguredSubsteps(world: World, g: Gear): boolean {
  return (substepNetworks.get(world) ?? []).some(net => net.ratios.has(g));
}
type BeltContactBody = { network: PassiveNetwork; ratio: number; speed: () => number };
const beltContactBodies = new WeakMap<World, Map<string, BeltContactBody>>();

export function beltContactBody(world: World, key: string): BeltContactBody | undefined {
  return beltContactBodies.get(world)?.get(key);
}

function applyNetworkImpulse(world: World, network: PassiveNetwork, speed: number): void {
  for (const [g, a] of network.ratios) {
    g.omega = a * speed;
    transmissionSpeeds.get(world)?.set(g, g.omega);
  }
  for (const output of network.outputs) output.set(speed * output.ratio);
}

export function applyBeltImpulse(world: World, body: BeltContactBody, impulse: number): void {
  if (Math.abs(impulse) > 1e-12) body.network.loaded = true;
  const speed = body.speed() / body.ratio + body.ratio * impulse / body.network.inertia;
  applyNetworkImpulse(world, body.network, speed);
}

export function gearContactToken(world: World, gear: Gear): object | undefined {
  return passiveNetworks.get(world)?.get(gear);
}

export function acceptsBallImpulse(world: World, gear: Gear): boolean {
  return passiveNetworks.get(world)?.has(gear) ?? false;
}

/** Inertia reflected to the contacted gear's angular coordinate. */
export function ballContactInertia(world: World, gear: Gear): number {
  const network = passiveNetworks.get(world)?.get(gear);
  if (!network) return Infinity;
  return network.inertia / network.ratios.get(gear)! ** 2;
}

export function applyBallAngularImpulse(world: World, gear: Gear, impulse: number): void {
  const network = passiveNetworks.get(world)?.get(gear);
  if (!network) return;
  if (Math.abs(impulse) > 1e-12) network.loaded = true;
  const ratio = network.ratios.get(gear)!;
  const speed = gear.omega / ratio + ratio * impulse / network.inertia;
  applyNetworkImpulse(world, network, speed);
  // Update surface velocities immediately for subsequent substep contacts.
  // Travel/angles remain integrated once by the existing frame update.
}

/** Mechanical constraints only for networks containing a new-style placed gear.
 * Legacy and unconnected factory mechanisms keep their original solver. */
export function solveConfiguredTransmission(world: World, dt: number, useSubsteps = false, contactSources?: Set<number>): void {
  const deferred: PassiveNetwork[] = [];
  substepNetworks.set(world, deferred);
  const passive = new Map<Gear, PassiveNetwork>();
  const priorContacts = passiveNetworks.get(world);
  passiveNetworks.set(world, passive);
  const beltBodies = new Map<string, BeltContactBody>();
  beltContactBodies.set(world, beltBodies);
  const previous = transmissionSpeeds.get(world) ?? new Map<Gear, number>();
  // Passive placed crawler rollers retain an impulse after their friction source leaves.
  // Never opt untouched factory machinery or legacy powered gears into this path.
  const coasting = (g: Gear) => g.placed && g.spin === "roller" && !!g.belt && !g.motorKind && g.drive === 0 && Math.abs(previous.get(g) ?? 0) >= 1e-5;
  if (!world.gears.some(g => g.motorKind || coasting(g))) { transmissionSpeeds.delete(world); return; }
  const next = new Map<Gear, number>();
  const gears = world.gears, regular = world.belts, loops = world.freeBelts ?? [];
  const n = gears.length, adj: { to: number; ratio: number }[][] = Array.from({ length: n + regular.length + loops.length }, () => []);
  const link = (a: number, b: number, ratio: number) => {
    adj[a].push({ to: b, ratio }); adj[b].push({ to: a, ratio: 1 / ratio });
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (spinsMesh(gears[i], gears[j])) link(i, j, -gears[i].r / gears[j].r);
  regular.forEach((b, i) => gears.forEach((g, j) => { if (g.belt === b.id) link(j, n + i, b.outerR); }));
  loops.forEach((b, i) => {
    if ((b.contacts?.length ?? 0) < 2) return;
    for (const c of b.contacts!) {
      const j = gears.findIndex(g => g.id === c.gearId);
      // Match the existing tangent/contact eligibility, including sharp corners.
      let best = Infinity, tx = 0, ty = 0;
      for (let k = 0; k < b.points.length; k++) {
        const p = b.points[k], q = b.points[(k + 1) % b.points.length];
        const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
        const t = Math.max(0, Math.min(1, ((c.point.x - p.x) * dx + (c.point.y - p.y) * dy) / (len * len)));
        const distance = Math.hypot(c.point.x - p.x - t * dx, c.point.y - p.y - t * dy);
        if (distance < best) { best = distance; tx = dx / len; ty = dy / len; }
      }
      const sign = c.normal.y * tx - c.normal.x * ty;
      if (j >= 0 && Math.abs(sign) > 0.99) link(j, n + regular.length + i, gears[j].r * Math.sign(sign));
    }
  });
  const seen = new Set<number>();
  const different = (a: number, b: number) => Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  for (let start = 0; start < n; start++) {
    if ((!gears[start].motorKind && !contactSources?.has(gears[start].id) && !coasting(gears[start])) || seen.has(start)) continue;
    const ratios = new Map<number, number>([[start, 1]]), queue = [start];
    let conflict = false;
    for (let k = 0; k < queue.length; k++) {
      const u = queue[k]; seen.add(u);
      for (const e of adj[u]) {
        const value = ratios.get(u)! * e.ratio;
        if (ratios.has(e.to)) { if (different(ratios.get(e.to)!, value)) conflict = true; }
        else { ratios.set(e.to, value); queue.push(e.to); }
      }
    }
    let inertia = 0, retainedInertia = 0, momentum = 0;
    const motors: Motor[] = [];
    const allPlaced = queue.every(u => u >= n || gears[u].placed);
    const loaded = queue.some(u => u < n && priorContacts?.get(gears[u])?.loaded);
    const defer = useSubsteps && allPlaced && !conflict;
    for (const u of queue) if (u < n) {
      const g = gears[u], ratio = ratios.get(u)!, rating = motorCharacteristics(g.r);
      const reflected = rating.inertia * ratio * ratio;
      inertia += reflected;
      // Preserve survivor speed through additions/splits; new stationary gears
      // add inertia but don't cause an artificial instantaneous speed reset.
      const old = previous.get(g) ?? (g.motorKind ? undefined : g.omega);
      if (old !== undefined) { retainedInertia += reflected; momentum += rating.inertia * ratio * old; }
      if (g.motorKind !== "follower" && g.drive !== 0) motors.push({ ratio, target: g.drive / Math.max(10, g.r), gain: rating.gain, maxTorque: rating.maxTorque });
    }
    let speed = retainedInertia > 0 ? momentum / retainedInertia : 0;
    const unpowered = !conflict && !motors.length;
    if (unpowered) {
      // Newly connected resting parts add inertia, not angular momentum.
      // Keep the motor model's existing survivor-speed policy unchanged.
      speed = momentum / Math.max(1e-8, inertia);
      if (!defer) speed *= Math.exp(-1.2 * Math.max(0, Math.min(0.05, dt)));
      if (Math.abs(speed) < 1e-5) speed = 0;
    } else if (conflict || !motors.length) speed = 0;
    else if (!defer) {
      // Bounded torque integration; subdivision avoids frame-rate instability.
      const duration = Math.max(0, Math.min(0.05, dt));
      const steps = Math.max(1, Math.ceil(duration * 240)), h = duration / steps;
      for (let k = 0; k < steps; k++) {
        let torque = 0;
        for (const m of motors) {
          const error = m.target - m.ratio * speed;
          // Smooth saturation retains restoring torque even when two strong
          // opposing motors would otherwise form a flat, constant-torque plateau.
          torque += m.ratio * m.maxTorque * (allPlaced && loaded ? PLACED_MOTOR_TORQUE_SCALE : 1) * Math.tanh(m.gain * error / m.maxTorque);
        }
        speed += torque / Math.max(1e-8, inertia) * h;
      }
    }
    const network: PassiveNetwork = { inertia: inertia * MOTOR_CONTACT_UNIT, ratios: new Map(), outputs: [], loaded };
    if (defer) { network.motors = motors; deferred.push(network); }
    for (const u of queue) {
      const value = speed * ratios.get(u)!;
      if (u < n) {
        gears[u].omega = value; next.set(gears[u], value);
        network.ratios.set(gears[u], ratios.get(u)!);
        if (!conflict && gears[u].placed && gears[u].motorKind) passive.set(gears[u], network);
      }
      else if (u < n + regular.length) {
        const b = regular[u - n]; b.travel += (value - b.speed) * dt; b.speed = value;
        const surfaces = world.segments.filter(s => s.belt === b.id);
        for (const s of surfaces) s.conveyor = value;
        if (!conflict && gears.filter(g => g.belt === b.id).every(g => g.placed))
          beltBodies.set(`belt:${b.id}`, { network, ratio: ratios.get(u)!, speed: () => b.speed });
        network.outputs.push({ ratio: ratios.get(u)!, set: v => {
          b.speed = v;
          for (const s of surfaces) s.conveyor = v;
        }, travel: d => { b.travel += d; } });
        if (defer) b.travel -= value * dt;
      } else {
        const b = loops[u - n - regular.length];
        b.travel = (((b.travel ?? 0) + (value - (b.speed ?? 0)) * dt) % b.length + b.length) % b.length;
        b.speed = value; b.conflicted = conflict;
        const surfaces = world.segments.filter(s => s.freeBelt === b.id);
        for (const s of surfaces) s.conveyor = value;
        if (!conflict) beltBodies.set(`free:${b.id}`, { network, ratio: ratios.get(u)!, speed: () => b.speed ?? 0 });
        network.outputs.push({ ratio: ratios.get(u)!, set: v => {
          b.speed = v;
          for (const s of surfaces) s.conveyor = v;
        }, travel: d => { b.travel = (((b.travel ?? 0) + d) % b.length + b.length) % b.length; } });
        if (defer) b.travel = (((b.travel ?? 0) - value * dt) % b.length + b.length) % b.length;
      }
    }
  }
  transmissionSpeeds.set(world, next);
}
