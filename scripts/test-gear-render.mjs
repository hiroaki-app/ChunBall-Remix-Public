import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { build } from 'esbuild';

const result = await build({
  stdin: { contents: ['world', 'draw', 'sim', 'wash', 'save'].map(m => `export * from './src/${m}';`).join(''), resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs',
});
const context = { URLSearchParams, module: { exports: {} }, window: { location: { search: '' } }, document: { body: { dataset: {} } } };
vm.runInNewContext(result.outputFiles[0].text, context);
const a = context.module.exports;

// Observe the actual drawWorld canvas calls, including both washer and generic
// renderers. Counting rotations at a gear centre catches duplicate silhouettes.
function render(w, preview = null, source = a) {
  let pose = { x: 0, y: 0 }, stack = [], rotations = [];
  const ctx = new Proxy({
    save() { stack.push({ ...pose }); },
    restore() { pose = stack.pop(); },
    translate(x, y) { pose = { x: pose.x + x, y: pose.y + y }; },
    rotate(angle) { rotations.push({ ...pose, angle }); },
    measureText() { return { width: 20 }; },
  }, { get: (obj, key) => obj[key] ?? (() => {}) });
  const before = JSON.stringify(w);
  source.drawWorld(ctx, w, 'line', null, preview, null);
  assert.equal(JSON.stringify(w), before, 'drawing must not mutate entities or physics');
  return (x, y) => rotations.filter(p => Math.abs(p.x - x) < 1e-8 && Math.abs(p.y - y) < 1e-8);
}
function one(w, at, angle, preview = null) {
  const hits = render(w, preview)(at.x, at.y);
  assert.equal(hits.length, 1, `one gear drawing at ${at.x},${at.y}`);
  if (angle !== undefined) assert.ok(Math.abs(hits[0].angle - angle) < 1e-8);
}
const step = (w, n = 120) => { for (let i = 0; i < n; i++) a.updateWorld(w, 1 / 60); };
const w = a.createStage('wash'), port = w.gears.find(g => g.id === w.wash.portId), saw = w.gears.find(g => g.id === w.wash.sawId);
step(w);
one(w, port, w.wash.motorAngle);
one(w, saw);
// Confirm this regression actually detects the original double-render bug.
const old = await build({ stdin: { contents: "export {drawWorld} from './src/draw';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'old-drawing-only', setup(b) {
  b.onLoad({ filter: /\/draw\.ts$/ }, ({ path }) => ({ contents: fs.readFileSync(path, 'utf8').replace(' || g.id === world.wash?.portId', ''), loader: 'ts' }));
} }] });
const oldContext = { ...context, module: { exports: {} } }; vm.runInNewContext(old.outputFiles[0].text, oldContext);
assert.equal(render(w, null, oldContext.module.exports)(port.x, port.y).length, 2);

const x = port.x - port.r - 18;
assert.ok(a.addPlacedGear(w, x, port.y, 18, 0, { motorKind: 'follower' }));
const follower = w.gears.at(-1), count = w.gears.length;
step(w);
assert.ok(w.wash.coupled && Math.abs(follower.omega) > 0);
assert.ok(Math.abs(follower.omega * follower.r + port.omega * port.r) < 1e-6);
one(w, port, port.angle); one(w, follower, follower.angle); one(w, saw);
const preview = { x: 600, y: 180, r: 18, drive: 0 };
one(w, preview, undefined, preview);
assert.equal(render(w)(preview.x, preview.y).length, 0, 'preview disappears when drag ends');
assert.equal(w.gears.length, count, 'renderer/preview cannot duplicate gear entities');
a.removeGear(w, follower.id); step(w);
assert.ok(!w.wash.coupled);
one(w, port, w.wash.motorAngle); one(w, saw);
const restored = a.loadSaveGame(a.parseSaveGame(JSON.parse(JSON.stringify(a.captureSaveGame(w)))));
one(restored, restored.gears.find(g => g.id === restored.wash.portId));
for (const stage of ['sewer', 'free', 'sandbox']) {
  const world = a.createStage(stage);
  assert.ok(a.addPlacedGear(world, 600, 300, 18, a.placedGearDrive(18, 1, 3), { motorKind: 'motor' }));
  assert.ok(a.addPlacedGear(world, 636, 300, 18, 0, { motorKind: 'follower' }));
  step(world); const [motor, passive] = world.gears.slice(-2);
  assert.ok(Math.abs(passive.omega) > 0 && motor.omega * passive.omega < 0);
  one(world, motor, motor.angle); one(world, passive, passive.angle);
}
console.log('PASS gear rendering: reproduces old duplicate; single washer outlines before/after mesh and separation; live angles, preview cleanup, entity count, save roundtrip and other four stages');
