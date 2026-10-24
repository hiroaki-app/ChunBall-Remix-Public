// Run with node scripts/test-sandbox-truck.mjs. No browser storage or repository writes.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: ["world", "draw", "save", "spin", "model", "gate", "recvTruck", "freeBelt", "sim", "beltGearContact", "sandbox"].map((m) => `export * from "./src/${m}";`).join(""),
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
});

function harness() {
  const events = {};
  const canvas = {
    style: {},
    getContext: () => ({}),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture() {},
    addEventListener(n, f) { events[n] = f; },
  };
  const context = vm.createContext({
    console,
    performance,
    URLSearchParams,
    document: { body: { dataset: {} }, getElementById: () => canvas },
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 1,
      location: { search: "" },
      addEventListener() {},
    },
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame() {},
    module: { exports: {} },
  });
  vm.runInContext(`(()=>{${bundle.outputFiles[0].text}\n})()`, context);
  const api = context.module.exports;
  Object.assign(context, api, { createSaveUi: () => ({}) });
  vm.runInContext(
    ts.transpileModule(fs.readFileSync("src/main.ts", "utf8").replace(/^import[\s\S]*?;\n/gm, ""), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText,
    context,
  );
  const event = (x, y) => ({ pointerId: 1, clientX: x, clientY: y, pointerType: "mouse", preventDefault() {} });
  const click = (x, y) => {
    events.pointerdown(event(x, y));
    events.pointerup(event(x, y));
  };
  const step = (n) => vm.runInContext(`for (let i = 0; i < ${n}; i++) updateWorld(world, 1/60);`, context);
  const world = () => vm.runInContext("world", context);
  return { api, context, click, step, world, events, event };
}

function btn(api, id) {
  return [...api.HUD_BTNS, ...api.STAGE_BTNS, api.SANDBOX_RELEASE_BTN].find((b) => b.id === id);
}

function mid(b) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

const h = harness();
const { api, click, step, world, context: c, events, event } = h;
const truck = mid(btn(api, "truck"));
const release = mid(btn(api, "release"));
const restart = mid(btn(api, "restart"));

vm.runInContext('world = createStage("sandbox")', c);
assert.equal(world().stage, "sandbox");
assert.equal(world().particles.length, 64);
assert.equal(api.stageHasRecvTruck("sandbox"), true);
assert.equal(api.stageHasRecvTruck("sewer"), false);
assert.equal(api.stageHasRecvTruck("wash"), false);

const gear = vm.runInContext("addPlacedGear(world, 180, 220, 28)", c);
const overlap = vm.runInContext("addPlacedGear(world, 200, 620, 28)", c);
const crawler = vm.runInContext("addPlacedBelt(world, 80, 250, 280, 250)", c);
const loop = vm.runInContext("addFreeBelt(world, [{x:80,y:320},{x:280,y:320},{x:280,y:420},{x:80,y:420}])", c);
assert.equal(gear, true);
assert.equal(overlap, true);
assert.equal(crawler, true);
assert.equal(loop, null);
const gearAt = world().gears.filter((g) => g.placed && !g.belt).map((g) => ({ x: g.x, y: g.y, r: g.r }));
const beltCount = world().belts.length;
const loopCount = world().freeBelts.length;

click(truck.x, truck.y);
assert.equal(vm.runInContext("tool", c), "line");
assert.equal(world().recvTruckStops.length, 0);
assert.equal(world().recvTrucks.length, 1);
assert.equal(world().recvTrucks[0].status, "approaching");
const dest = api.sandboxRecvInletTarget();
assert.equal(world().recvTrucks[0].targetInletX, dest.x);
assert.equal(world().recvTrucks[0].targetInletY, dest.y);
assert.equal(world().particles.length, 64);

let arrived = false;
for (let i = 0; i < 240 && !arrived; i++) {
  step(1);
  arrived = world().recvTrucks[0]?.status === "waiting";
}
assert.equal(arrived, true);
assert.equal(world().recvTrucks[0].x, dest.x);
assert.equal(world().recvTrucks[0].y, dest.y);
assert.deepEqual(world().gears.filter((g) => g.placed && !g.belt).map((g) => ({ x: g.x, y: g.y, r: g.r })), gearAt);
assert.equal(world().belts.length, beltCount);
assert.equal(world().freeBelts.length, loopCount);
assert.equal(world().particles.length, 64);
console.log("PASS sandbox icon calls a fixed inlet and keeps placed parts");

const saved = api.captureSaveGame(world());
assert.equal(saved.stageId, "sandbox");
assert.equal(saved.placedParts.some((p) => p.type === "truckStop"), false);
assert.ok(saved.placedParts.some((p) => p.type === "gear"));
assert.ok(saved.placedParts.some((p) => p.type === "belt"));
assert.ok(saved.placedParts.some((p) => p.type === "freeBelt"));
const restored = api.loadSaveGame(saved);
assert.equal(restored.stage, "sandbox");
assert.equal(restored.recvTrucks.length, 0);
assert.equal(restored.recvTruckStops.length, 0);
assert.equal(restored.particles.length, 64);
assert.equal(restored.gears.filter((g) => g.placed && !g.belt).length, 2);
assert.equal(restored.belts.length, beltCount);
assert.equal(restored.freeBelts.length, loopCount);
console.log("PASS save keeps placed parts and does not persist the live truck");

click(truck.x, truck.y);
assert.equal(world().recvTrucks[0].status, "departing");
let gone = false;
for (let i = 0; i < 300 && !gone; i++) {
  step(1);
  gone = world().recvTrucks.length === 0;
}
assert.equal(gone, true);
assert.equal(world().sandbox.released, false);
assert.equal(world().particles.length, 64);
assert.deepEqual(world().gears.filter((g) => g.placed && !g.belt).map((g) => ({ x: g.x, y: g.y, r: g.r })), gearAt);
assert.equal(world().belts.length, beltCount);
console.log("PASS empty depart leaves the basket and placed parts");

click(restart.x, restart.y);
assert.equal(world().stage, "sandbox");
assert.equal(world().recvTrucks.length, 0);
assert.equal(world().particles.length, 64);
click(truck.x, truck.y);
for (let i = 0; i < 240 && world().recvTrucks[0]?.status !== "waiting"; i++) step(1);
assert.equal(world().recvTrucks[0].status, "waiting");
click(release.x, release.y);
assert.equal(world().sandbox.released, true);
assert.equal(world().particles.length, 64);
step(180);
const lay = api.layoutRecvTruck(world().recvTrucks[0]);
const caught = world().particles.filter((p) => p.x > lay.hopL && p.x < lay.hopR && p.y > lay.hopTop && p.y < lay.hopBot);
assert.ok(caught.length > 0, `caught ${caught.length}`);
console.log(`PASS sandbox hopper caught ${caught.length} of the released balls`);

click(truck.x, truck.y);
assert.equal(world().recvTrucks[0].status, "departing");
gone = false;
for (let i = 0; i < 300 && !gone; i++) {
  step(1);
  gone = world().recvTrucks.length === 0;
}
assert.equal(gone, true);
for (let i = 0; i < 360 && world().particles.length > 0; i++) step(1);
assert.equal(world().particles.length, 0);
step(50);
assert.equal(world().sandbox.released, false);
assert.equal(world().particles.length, 64);
assert.ok(world().particles.every((p) => p.sleeping));
click(truck.x, truck.y);
assert.equal(world().recvTrucks.length, 1);
assert.equal(world().recvTrucks[0].status, "approaching");
assert.equal(world().recvTruckStops.length, 0);
console.log("PASS depart, refill, and a second call");

click(restart.x, restart.y);
assert.equal(world().stage, "sandbox");
assert.equal(world().recvTrucks.length, 0);
assert.equal(world().particles.length, 64);
assert.equal(world().gears.filter((g) => g.placed).length, 0);
console.log("PASS sandbox reset clears the truck");

click(mid(btn(api, "sewer")).x, mid(btn(api, "sewer")).y);
assert.equal(world().stage, "sewer");
click(truck.x, truck.y);
assert.equal(world().recvTrucks.length, 0);
click(mid(btn(api, "wash")).x, mid(btn(api, "wash")).y);
assert.equal(world().stage, "wash");
click(truck.x, truck.y);
assert.equal(world().recvTrucks.length, 0);
console.log("PASS sewer and wash ignore the truck button");


click(mid(btn(api, "free")).x, mid(btn(api, "free")).y);
assert.equal(world().stage, "free");
assert.equal(world().recvTrucks.length, 0);
click(truck.x, truck.y);
assert.equal(vm.runInContext("tool", c), "truckStop");
assert.equal(world().recvTrucks.length, 0);
click(520, 340);
assert.equal(world().recvTruckStops.length, 1);
assert.equal(world().recvTrucks.length, 1);
assert.equal(world().recvTruckStops[0].inletX, 520);
assert.equal(world().recvTruckStops[0].inletY, 300);
console.log("PASS free stop placement is unchanged");

vm.runInContext('world = createStage("sandbox"); tool = "line"', c);
click(truck.x, truck.y);
click(truck.x, truck.y);
click(truck.x, truck.y);
assert.equal(world().recvTrucks.length, 1);
assert.equal(world().recvTrucks[0].status, "departing");
assert.equal(world().recvTruckStops.length, 0);
console.log("PASS repeated truck taps do not spawn extra trucks");

vm.runInContext('world = createStage("sandbox"); tool = "line"', c);
const launch = api.TRUCK_STOP_LAUNCH;
assert.ok(api.showTruckStopLauncher("sandbox"));
const placeStop = (x, y) => {
  events.pointerdown(event(launch.x, launch.y));
  events.pointermove(event(x, y));
  events.pointerup(event(x, y));
};
placeStop(220, 420);
placeStop(520, 420);
placeStop(820, 420);
assert.equal(world().recvTruckStops.length, 3);
assert.equal(world().recvTrucks.length, 0);
const placed = world().recvTruckStops.map((s) => [s.inletX, s.inletY]);
assert.equal(placed[0][0], 220);
assert.equal(placed[0][1], 380);
assert.equal(placed[1][0], 520);
assert.equal(placed[1][1], 380);
assert.equal(placed[2][0], 820);
assert.equal(placed[2][1], 380);

click(truck.x, truck.y);
assert.equal(world().recvTrucks.length, 3);
const fleet = () => world().recvTrucks;
assert.equal(fleet().filter((t) => t.targetId < 0).length, 0);
for (const stop of world().recvTruckStops) {
  const truckAt = fleet().find((t) => t.targetId === stop.id);
  assert.ok(truckAt);
  assert.equal(truckAt.targetInletX, stop.inletX);
  assert.equal(truckAt.targetInletY, stop.inletY);
  assert.equal(truckAt.status, "approaching");
}
console.log("PASS three stops call only those stops");

placeStop(400, 300);
assert.equal(world().recvTruckStops.length, 4);
assert.equal(fleet().length, 3);
const victim = world().recvTruckStops[0];
const victimId = victim.id;
const eraser = api.ERASER_LAUNCH;
const eraseAt = (x, y) => {
  events.pointerdown(event(eraser.x, eraser.y));
  events.pointermove(event(x, y + 72));
  events.pointerup(event(x, y + 72));
};
eraseAt(victim.inletX, victim.inletY);
assert.equal(world().recvTruckStops.some((s) => s.id === victimId), false);
assert.equal(fleet().length, 3);
assert.equal(fleet().find((t) => t.targetId === victimId).status, "departing");
assert.equal(fleet().filter((t) => t.status === "approaching").length, 2);
console.log("PASS adding or deleting a stop during a call does not spawn or strand a truck");

click(truck.x, truck.y);
assert.equal(fleet().length, 3);
assert.ok(fleet().every((t) => t.status === "departing"));
click(truck.x, truck.y);
assert.equal(fleet().length, 3);
console.log("PASS a second and third press send the fleet home without adding trucks");

const moved = world().recvTruckStops[1];
const movedTruck = fleet().find((t) => t.targetId === moved.id);
events.pointerdown(event(moved.inletX, moved.inletY));
events.pointermove(event(300, 500));
events.pointerup(event(300, 500));
assert.equal(fleet().length, 3);
assert.equal(moved.inletX, 300);
assert.equal(moved.inletY, 460);
assert.equal(movedTruck.targetInletX, 300);
assert.equal(movedTruck.targetInletY, 460);
console.log("PASS moving a stop retargets its truck and does not add one");

for (let i = 0; i < 400 && world().recvTrucks.length > 0; i++) step(1);
assert.equal(world().recvTrucks.length, 0);
click(truck.x, truck.y);
assert.equal(world().recvTrucks.length, 3);
assert.equal(world().recvTrucks.filter((t) => t.targetId < 0).length, 0);
console.log("PASS the next call uses the remaining stops and skips the basket");

click(truck.x, truck.y);
for (let i = 0; i < 400 && world().recvTrucks.length > 0; i++) step(1);
for (const stop of world().recvTruckStops.slice()) eraseAt(stop.inletX, stop.inletY);
assert.equal(world().recvTruckStops.length, 0);
click(truck.x, truck.y);
assert.equal(world().recvTrucks.length, 1);
assert.equal(world().recvTrucks[0].targetId, -1);
assert.equal(world().recvTrucks[0].targetInletX, dest.x);
assert.equal(world().recvTrucks[0].targetInletY, dest.y);
console.log("PASS deleting every stop returns the next call to the basket");

vm.runInContext('world = createStage("sandbox"); tool = "line"', c);
placeStop(520, 420);
assert.equal(world().recvTrucks.length, 0);
click(truck.x, truck.y);
assert.equal(world().recvTrucks.length, 1);
assert.equal(world().recvTrucks[0].targetId, world().recvTruckStops[0].id);
assert.equal(world().recvTrucks[0].targetInletX, 520);
assert.equal(world().recvTrucks[0].targetInletY, 380);
click(truck.x, truck.y);
assert.equal(world().recvTrucks[0].status, "departing");
for (let i = 0; i < 400 && world().recvTrucks.length > 0; i++) step(1);
click(truck.x, truck.y);
assert.equal(world().recvTrucks.length, 1);
assert.equal(world().recvTrucks[0].targetInletX, 520);
console.log("PASS one stop calls only that stop, then again after it leaves");

const savedStop = api.captureSaveGame(world());
assert.equal(savedStop.placedParts.filter((p) => p.type === "truckStop").length, 1);
const loadedStop = api.loadSaveGame(savedStop);
assert.equal(loadedStop.recvTruckStops.length, 1);
assert.equal(loadedStop.recvTrucks.length, 0);
assert.equal(loadedStop.particles.length, 64);
api.toggleRecvTruck(loadedStop);
assert.equal(loadedStop.recvTrucks.length, 1);
assert.equal(loadedStop.recvTrucks[0].targetId, loadedStop.recvTruckStops[0].id);
assert.equal(loadedStop.recvTrucks.filter((t) => t.targetId < 0).length, 0);
console.log("PASS a loaded stop calls that stop and not the basket");

click(mid(btn(api, "sewer")).x, mid(btn(api, "sewer")).y);
assert.equal(world().stage, "sewer");
assert.equal(world().recvTrucks.length, 0);
click(mid(btn(api, "sandbox")).x, mid(btn(api, "sandbox")).y);
assert.equal(world().stage, "sandbox");
assert.equal(world().recvTruckStops.length, 0);
click(truck.x, truck.y);
assert.equal(world().recvTrucks.length, 1);
assert.equal(world().recvTrucks[0].targetId, -1);
assert.equal(world().recvTrucks[0].targetInletX, dest.x);
console.log("PASS a fresh sandbox after switching stages calls the basket");
