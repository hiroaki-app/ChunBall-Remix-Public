// Production updateWorld path for washer outputs and a second cycle.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: ["world", "spin", "sim", "save", "wash", "beltGearContact"].map((m) => `export * from './src/${m}';`).join(""),
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
});
const context = { Math, module: { exports: {} } };
vm.runInNewContext(bundle.outputFiles[0].text, context);
const api = context.module.exports;

const portLayout = api.WASH_LAYOUT.gears[0];
const sawLayout = api.WASH_LAYOUT.gears[1];
const followerR = 28;

function run(world, seconds, dt = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / dt); i++) api.updateWorld(world, dt);
}

function until(world, pred, seconds = 60) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    api.updateWorld(world, dt);
    if (pred(world)) return true;
  }
  return false;
}

function placeFollower(world, output) {
  const at = output === portLayout
    ? { x: portLayout.x, y: portLayout.y + portLayout.r + followerR }
    : (() => {
        const dx = sawLayout.x - portLayout.x;
        const dy = sawLayout.y - portLayout.y;
        const d = Math.hypot(dx, dy);
        const reach = sawLayout.r + followerR;
        return { x: sawLayout.x + (dx / d) * reach, y: sawLayout.y + (dy / d) * reach };
      })();
  assert.equal(api.washGearMesh(world, { ...at, r: followerR }), true, "preview sees the mesh");
  const committed = api.resolveGearPlacement(world, { ...at, r: followerR, motorKind: "follower" });
  assert.equal(committed.x, at.x);
  assert.equal(committed.y, at.y, "preview coordinate is the committed coordinate");
  assert.equal(api.addPlacedGear(world, committed.x, committed.y, followerR, 0, { motorKind: "follower" }), true);
  const gear = world.gears.at(-1);
  assert.equal(api.washGearMesh(world, gear), true, "committed gear still meshes");
  return gear;
}

function ratioError(driven, source, sourceR, drivenR, direction) {
  return Math.abs(driven.omega - direction * source.omega * (sourceR / drivenR));
}

{
  const world = api.createStage("wash");
  const port = world.gears.find((g) => g.id === world.wash.portId);
  const saw = world.gears.find((g) => g.id === world.wash.sawId);
  assert.equal(world.gears.length, 2);
  assert.equal(port.x, portLayout.x);
  assert.equal(saw.x, sawLayout.x);
  assert.equal(api.spinsMesh(port, saw), false, "unused saw stays out of the original train");
  const pulley = api.WASH_LAYOUT.motor;
  const besidePulley = { x: pulley.x - pulley.r - followerR, y: pulley.y, r: followerR };
  assert.equal(api.washGearMesh(world, besidePulley), false, "belt pulley is not a mesh point");
  console.log("PASS washer has a belt pulley, an output gear, and a separate saw");
}

{
  const world = api.createStage("wash");
  const portGear = placeFollower(world, portLayout);
  assert.ok(until(world, (w) => w.wash.motion === "stir" && Math.abs(w.wash.motorOmega) > 0.5, 8));
  const port = world.gears.find((g) => g.id === world.wash.portId);
  const saw = world.gears.find((g) => g.id === world.wash.sawId);
  assert.equal(world.wash.sawJoined, false);
  assert.equal(port.washLinked, false);
  assert.ok(ratioError(portGear, port, port.r, portGear.r, -1) < 1e-6, "output gear keeps its old ratio and direction");
  assert.ok(Math.abs(saw.omega) < 1e-6, "unused saw is not driven");
  console.log("PASS original output gear", { port: port.omega, follower: portGear.omega });
}

{
  const world = api.createStage("wash");
  const sawGear = placeFollower(world, sawLayout);
  assert.ok(until(world, (w) => w.wash.motion === "stir" && Math.abs(w.wash.motorOmega) > 0.5, 8));
  const port = world.gears.find((g) => g.id === world.wash.portId);
  const saw = world.gears.find((g) => g.id === world.wash.sawId);
  assert.equal(world.wash.sawJoined, true);
  assert.equal(api.spinsMesh(port, saw), true);
  assert.ok(ratioError(saw, port, port.r, saw.r, -1) < 1e-6, "saw turns opposite the output, at the tooth ratio");
  assert.ok(ratioError(sawGear, port, port.r, sawGear.r, 1) < 1e-6, "gear on the saw is driven through that mesh");
  assert.ok(Math.abs(world.wash.pulsatorOmega - port.omega) < 1e-6);
  console.log("PASS sawtooth output", { port: port.omega, saw: saw.omega, follower: sawGear.omega });
}

{
  const world = api.createStage("wash");
  const onPort = placeFollower(world, portLayout);
  const onSaw = placeFollower(world, sawLayout);
  assert.equal(api.spinsMesh(onPort, onSaw), false, "the two placed gears do not mesh each other");
  assert.ok(until(world, (w) => w.wash.phase === "spin" && Math.abs(w.wash.tubOmega) > 8, 50));
  const port = world.gears.find((g) => g.id === world.wash.portId);
  const saw = world.gears.find((g) => g.id === world.wash.sawId);
  assert.equal(world.wash.motion, "spin");
  assert.ok(Math.abs(world.wash.tubOmega - port.omega) < 1e-6, "spin shaft still follows the output gear");
  assert.ok(ratioError(onPort, port, port.r, onPort.r, -1) < 1e-6);
  assert.ok(ratioError(saw, port, port.r, saw.r, -1) < 1e-6);
  assert.ok(ratioError(onSaw, port, port.r, onSaw.r, 1) < 1e-6);
  assert.ok([port, saw, onPort, onSaw].every((gear) => Number.isFinite(gear.omega)));
  console.log("PASS both outputs during spin", { port: port.omega, saw: saw.omega, tub: world.wash.tubOmega });
}

{
  const sample = (fight) => {
    const world = api.createStage("wash");
    placeFollower(world, portLayout);
    placeFollower(world, sawLayout);
    if (fight) {
      const port = world.gears.find((g) => g.id === world.wash.portId);
      assert.equal(api.addPlacedGear(world, port.x - port.r - followerR, port.y, followerR, api.placedGearDrive(followerR, -1, 5), { motorKind: "motor", speedLevel: 5 }), true);
    }
    assert.ok(until(world, (w) => w.wash.motion === "stir", 8));
    let sum = 0;
    let count = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 180; i++) {
      api.updateWorld(world, dt);
      const port = world.gears.find((g) => g.id === world.wash.portId);
      sum += port.omega;
      count++;
    }
    return sum / count;
  };
  const alone = sample(false);
  const opposed = sample(true);
  assert.ok(Math.abs(opposed - alone) > 1, "external motor torque shifts the washer shaft");
  console.log("PASS external reaction", { alone, opposed });
}

{
  const world = api.createStage("wash");
  const kept = placeFollower(world, sawLayout);
  const kinds = world.wash.laundry.map((item) => item.kind);
  assert.ok(until(world, (w) => w.wash.finished, 55));
  assert.equal(world.wash.lid, "open");
  assert.equal(world.wash.power, false);
  for (const item of world.wash.laundry) item.dirt.length = 0;
  const gearAt = { x: kept.x, y: kept.y, id: kept.id };
  api.toggleWashPower(world);
  assert.equal(world.wash.finished, false);
  assert.equal(world.wash.power, true);
  assert.equal(world.wash.phase, "fill1");
  assert.equal(world.wash.queuedDrops.length, 1);
  assert.equal(world.wash.queuedDrops[0], "water");
  assert.equal(world.wash.queuedDrops.includes("detergent"), false);
  assert.ok(until(world, (w) => w.wash.lid === "closed" && w.wash.motion === "fill", 5));
  assert.equal(api.washPhaseLabel(world.wash), "給水");
  assert.ok(Math.abs(world.wash.tubOmega) < 1, "a new fill does not keep the spin");
  assert.ok(until(world, (w) => w.wash.phase === "spin" && Math.abs(w.wash.tubOmega) > 8, 50));
  assert.equal(world.wash.laundry.map((item) => item.kind).join(), kinds.join());
  assert.ok(world.wash.laundry.every((item) => item.dirt.length === 0), "fallen dirt does not return");
  assert.ok(world.gears.some((g) => g.id === gearAt.id && g.x === gearAt.x && g.y === gearAt.y));
  assert.equal(world.wash.sawJoined, true);
  assert.ok(until(world, (w) => w.wash.finished, 20));
  api.toggleWashPower(world);
  assert.equal(world.wash.phase, "fill1");
  assert.equal(world.wash.power, true);
  console.log("PASS second and third cycles keep laundry and the placed gear");
}

{
  const world = api.createStage("wash");
  assert.ok(until(world, (w) => w.wash.phase === "wash" && w.wash.motion === "stir", 8));
  const phaseLeft = world.wash.phaseLeft;
  api.toggleWashPower(world);
  assert.equal(world.wash.power, false);
  assert.ok(until(world, (w) => w.wash.lid === "open", 5));
  assert.equal(world.wash.phase, "wash");
  assert.equal(world.wash.finished, false);
  assert.ok(world.wash.phaseLeft <= phaseLeft);
  api.toggleWashPower(world);
  assert.equal(world.wash.power, true);
  assert.ok(until(world, (w) => w.wash.lid === "closed" && w.wash.motion === "stir", 5));
  assert.equal(world.wash.phase, "wash", "power-on resumes the interrupted phase");
  console.log("PASS power off coasts open, power on resumes");
}

{
  const world = api.createStage("wash");
  placeFollower(world, portLayout);
  const saved = JSON.parse(JSON.stringify(api.captureSaveGame(world)));
  assert.equal(saved.placedParts.some((part) => part.washBuiltIn), false);
  const restored = api.loadSaveGame(api.parseSaveGame(saved));
  assert.ok(restored.gears.some((g) => g.id === restored.wash.portId && !g.placed));
  assert.ok(restored.gears.some((g) => g.id === restored.wash.sawId && g.x === sawLayout.x && !g.placed));
  assert.equal(restored.wash.laundry.length, world.wash.laundry.length);
  console.log("PASS wash save still restores both built-in gears and the placed gear");
}

const ui = await build({
  stdin: {
    contents: ["world", "draw", "save", "spin", "model", "gate", "recvTruck", "freeBelt", "sim", "beltGearContact", "wash"].map((m) => `export * from './src/${m}';`).join(""),
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
});
{
  const labels = [];
  const ctx = new Proxy({ fillText: (text) => labels.push(text), measureText: () => ({ width: 20 }) }, { get: (obj, key) => obj[key] ?? (() => {}) });
  const events = {};
  const canvas = { style: {}, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {}, addEventListener: (name, fn) => { events[name] = fn; } };
  const uiContext = vm.createContext({
    console, performance, URLSearchParams,
    document: { body: { dataset: {} }, getElementById: () => canvas },
    window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, location: { search: "" }, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame() {},
    module: { exports: {} },
  });
  vm.runInContext(ui.outputFiles[0].text, uiContext);
  const a = uiContext.module.exports;
  Object.assign(uiContext, a, { createSaveUi: () => ({}) });
  vm.runInContext(ts.transpileModule(fs.readFileSync("src/main.ts", "utf8").replace(/^import[\s\S]*?;\n/gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, uiContext);
  const pointer = (x, y) => ({ pointerId: 1, clientX: x, clientY: y, pointerType: "mouse", preventDefault() {} });
  const stage = a.STAGE_BTNS.find((button) => button.id === "wash");
  events.pointerdown(pointer(stage.x + 20, stage.y + 20));
  events.pointerup(pointer(stage.x + 20, stage.y + 20));
  const fingerFor = (x, y, r) => ({ x, y: y + r + 52 });
  const drop = (launch, at) => {
    const finger = fingerFor(at.x, at.y, launch.r);
    events.pointerdown(pointer(launch.x, launch.y));
    events.pointermove(pointer(finger.x, finger.y));
    labels.length = 0;
    vm.runInContext("paint()", uiContext);
    const preview = vm.runInContext("({ x: dragGear.x, y: dragGear.y })", uiContext);
    events.pointerup(pointer(finger.x, finger.y));
    return preview;
  };
  const follower = a.FOLLOWER_LAUNCH.find((gear) => gear.r === followerR);
  const sawAt = (() => {
    const dx = sawLayout.x - portLayout.x;
    const dy = sawLayout.y - portLayout.y;
    const d = Math.hypot(dx, dy);
    const reach = sawLayout.r + followerR;
    return { x: sawLayout.x + (dx / d) * reach, y: sawLayout.y + (dy / d) * reach };
  })();
  const preview = drop(follower, sawAt);
  assert.ok(Math.abs(preview.x - sawAt.x) < 1e-6 && Math.abs(preview.y - sawAt.y) < 1e-6);
  assert.ok(labels.includes("ギア接続"));
  assert.ok(!labels.includes("ベルトと重なっています"));
  const world = vm.runInContext("world", uiContext);
  const placed = world.gears.find((gear) => gear.placed);
  assert.ok(placed);
  assert.equal(placed.x, preview.x);
  assert.equal(placed.y, preview.y);
  assert.equal(a.washGearMesh(world, placed), true);
  const motor = a.GEAR_LAUNCH.find((gear) => gear.r === followerR);
  const portAt = { x: portLayout.x, y: portLayout.y + portLayout.r + followerR };
  const portPreview = drop(motor, portAt);
  assert.equal(portPreview.x, portAt.x);
  assert.equal(portPreview.y, portAt.y);
  assert.ok(labels.includes("ギア接続"));
  const outputs = world.gears.filter((gear) => gear.placed);
  assert.equal(outputs.length, 2);
  assert.ok(outputs.every((gear) => a.washGearMesh(world, gear)));
  console.log("PASS placement preview matches both washer outputs");
}

console.log("WASH OUTPUT CHECK PASS");
