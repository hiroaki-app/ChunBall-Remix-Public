// Run with node scripts/test-free-belt.mjs. No browser storage or repository writes.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import { build } from "esbuild";

const bundle = await build({
  stdin: { contents: ["world", "draw", "save", "spin", "model", "gate", "recvTruck", "freeBelt", "sim", "beltGearContact"].map(m => `export * from "./src/${m}";`).join(""), resolveDir: process.cwd() },
  bundle: true, write: false, format: "cjs", platform: "node",
});
function harness(type = "mouse", mode = "") {
  const events = {}, windowEvents = {}, storage = new Map();
  const canvas = { style: {}, getContext: () => ({}), getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {}, addEventListener(n, f) { events[n] = f; } };
  const context = vm.createContext({ console, performance, URLSearchParams,
    document: { body: { dataset: { chunballMode: mode } }, getElementById: () => canvas },
    window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, location: { search: "" }, addEventListener(n, f) { windowEvents[n] = f; } },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, requestAnimationFrame() {}, module: { exports: {} },
  });
  vm.runInContext(`(()=>{${bundle.outputFiles[0].text}\n})()`, context);
  const api = context.module.exports;
  Object.assign(context, api, { createSaveUi: () => ({}) });
  vm.runInContext(ts.transpileModule(fs.readFileSync("src/main.ts", "utf8").replace(/^import[\s\S]*?;\n/gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  const event = (x, y, id = 1) => ({ pointerId: id, clientX: x, clientY: y, pointerType: type, preventDefault() {} });
  return { api, context, events, windowEvents, event, world: vm.runInContext("world", context) };
}

const { api } = harness();
for (const type of ["mouse", "touch"]) {
  const h = harness(type), {api:a, events:e, event:p, context:c} = h;
  vm.runInContext('world = createStage("free")', c);
  const w = vm.runInContext('world', c), truck = a.HUD_BTNS.find(b => b.id === 'truck');
  const click = (x,y) => {e.pointerdown(p(x,y));e.pointerup(p(x,y));};
  click(truck.x+20,truck.y+20); assert.equal(vm.runInContext('tool',c),'truckStop');
  assert.equal(w.recvTrucks.length,0);
  click(520,340); assert.equal(w.recvTruckStops.length,1); assert.equal(w.recvTrucks.length,1);
  assert.equal(w.recvTruckStops[0].inletX,520); assert.equal(w.recvTruckStops[0].inletY,300);
  assert.equal(vm.runInContext('tool',c),'line');
  click(truck.x+20,truck.y+20); assert.equal(w.recvTrucks[0].status,'departing');
  console.log(`PASS truck ${type}: free HUD position selection/call/depart`);
}
for (const slope of [false, true]) {
  const w = api.createStage("free");
  w.gears = []; w.segments = []; w.belts = []; w.particles = []; w.blowers = []; w.spawnAcc = -1e6;
  const top = x => slope ? 200 - (x - 300) / 4 : 150;
  api.addFreeBelt(w, [{ x: 300, y: top(300) }, { x: 900, y: top(900) }, { x: 900, y: 350 }, { x: 300, y: 350 }]);
  for (const x of [420, 740]) {
    const snap = api.freeBeltSnap(w, { x, y: top(x) + 25 }, 18);
    assert.ok(snap); api.addPlacedGear(w, snap.x, snap.y, 18, 120);
  }
  const p = { id: w.nextId++, kind: "other", x: 500, y: top(500) - 5, vx: 0, vy: 0, r: 5, frozen: false, sleeping: false, sleepTime: 0, standing: false, stem: 0, angle: 0, marked: false, color: "#fff", trackId: null, headColors: [], depth: 0 };
  w.particles.push(p);
  const initialY = p.y;
  for (let i = 0; i < 90; i++) api.updateWorld(w, 1 / 60);
  assert.ok(p.x > 580, `transport x=${p.x}`);
  if (slope) assert.ok(p.y < initialY - 15, `incline y=${p.y}`);
  assert.ok(w.particles.some(q => q.id === p.id));
  assert.ok(Math.abs(w.freeBelts[0].travel) > 0);
  console.log(`PASS stage 4 actual physics: ${slope ? "uphill" : "horizontal"} transport, same entity, tread travel`);
}
{
  const w = api.createStage("free");
  api.addFreeBelt(w, [{ x: 300, y: 200 }, { x: 900, y: 200 }, { x: 900, y: 480 }, { x: 300, y: 480 }]);
  api.addPlacedGear(w, 420, 223, 18, 120);
  api.addPlacedGear(w, 720, 245, 40, 180);
  const nodes = w.gears.filter(g => g.placed && !g.belt);
  api.solveSpin(w.gears); api.driveFreeBelts(w, 1 / 60);
  assert.ok(w.freeBelts[0].speed > 0);
  assert.ok(Math.abs(nodes[0].omega * nodes[0].r - nodes[1].omega * nodes[1].r) < 1e-6);
  api.addPlacedGear(w, 570, 223, 18, 120); api.driveFreeBelts(w, 1 / 60);
  assert.equal(w.freeBelts[0].contacts.length, 3); assert.ok(w.freeBelts[0].speed > 0);
  api.removeGear(w, w.gears.at(-1).id);
  api.addPlacedGear(w, 456, 223, 18, 120); api.driveFreeBelts(w, 1 / 60);
  assert.equal(w.freeBelts[0].speed, 0); assert.ok(w.freeBelts[0].conflicted);
  api.removeGear(w, w.gears.at(-1).id);
  nodes[0].drive *= -1; api.driveFreeBelts(w, 1 / 60);
  assert.equal(w.freeBelts[0].speed, 0); assert.ok(w.freeBelts[0].conflicted);
  nodes[1].drive *= -1; api.driveFreeBelts(w, 1 / 60); assert.ok(w.freeBelts[0].speed < 0);
  nodes[0].drive = 0; nodes[1].drive = 0; api.driveFreeBelts(w, 1 / 60); assert.equal(w.freeBelts[0].speed, 0);
  nodes[1].drive = 120; api.driveFreeBelts(w, 1 / 60); assert.ok(nodes[0].omega > 0);
  const restored = api.loadSaveGame(api.parseSaveGame(api.captureSaveGame(w)));
  api.solveSpin(restored.gears); api.driveFreeBelts(restored, 1 / 60); assert.ok(restored.freeBelts[0].speed > 0);
  api.removeGear(w, nodes[0].id); api.driveFreeBelts(w, 1 / 60); assert.equal(w.freeBelts[0].speed, 0);
  console.log("PASS stage 4: unequal radii, surface speed sync, passive follower, reverse/conflict/stop/removal, save restore");
}
{
  const w = api.createStage("free");
  const points = [{ x: 300, y: 160 }, { x: 700, y: 160 }, { x: 700, y: 430 }, { x: 300, y: 430 }];
  api.addFreeBelt(w, points);
  const geometry = JSON.stringify(w.segments.filter(s => s.freeBelt));
  for (const [x, r] of [[380, 18], [500, 28], [620, 40]]) {
    const snap = api.freeBeltSnap(w, { x, y: 160 + r + 9 }, r);
    assert.ok(snap); assert.equal(snap.y, 160 + r + 5);
    assert.ok(api.freeBeltPlacementAllowed(w, snap, r));
    api.addPlacedGear(w, snap.x, snap.y, r);
  }
  assert.equal(w.freeBelts[0].contacts.length, 3);
  assert.equal(api.freeBeltSnap(w, { x: 500, y: 130 }, 28), null);
  assert.equal(api.freeBeltSnap(w, { x: 500, y: 300 }, 28), null);
  assert.ok(!api.freeBeltPlacementAllowed(w, { x: 500, y: 160 }, 28));
  const saved = api.captureSaveGame(w);
  assert.equal(saved.placedParts[0].gearParts.length, 3);
  const restored = api.loadSaveGame(api.parseSaveGame(JSON.parse(JSON.stringify(saved))));
  assert.equal(restored.freeBelts[0].contacts.length, 3);
  assert.ok(restored.freeBelts[0].contacts.every(c => restored.gears.some(g => g.id === c.gearId)));
  const legacy = JSON.parse(JSON.stringify(saved)); delete legacy.placedParts[0].gearParts;
  assert.equal(api.loadSaveGame(api.parseSaveGame(legacy)).freeBelts[0].contacts.length, 3);
  const bad = JSON.parse(JSON.stringify(saved)); bad.placedParts[0].gearParts = [0]; assert.equal(api.parseSaveGame(bad), null);
  const gear = w.gears.find(g => g.placed && !g.belt);
  gear.y = 300; api.syncFreeBeltContacts(w); assert.equal(w.freeBelts[0].contacts.length, 2);
  const id = w.freeBelts[0].contacts[0].gearId;
  api.removeGear(w, id); assert.equal(w.freeBelts[0].contacts.length, 1);
  assert.equal(JSON.stringify(w.segments.filter(s => s.freeBelt)), geometry);
  assert.ok(w.segments.filter(s => s.freeBelt).every(s => s.conveyor === 0));
  const remaining = w.freeBelts[0].contacts[0].gearId;
  api.applyEraser(w, [{ kind: "freeBelt", id: w.freeBelts[0].id }]);
  assert.ok(w.gears.some(g => g.id === remaining));
  console.log("PASS stage 3: three radii, inside-only snap, invalid/penetrating rejection, contact removal, stable save references/v2 compatibility, unchanged geometry/no drive");
}
const rectangle = [{ x: 300, y: 180 }, { x: 480, y: 180 }, { x: 480, y: 280 }, { x: 300, y: 280 }, { x: 300, y: 180 }];
const loop = api.prepareFreeLoop(rectangle);
assert.ok(!("error" in loop)); assert.equal(loop.length, 560);
for (const raw of [rectangle.slice(0, -1), [rectangle[0], rectangle[2], rectangle[3], rectangle[1], rectangle[0]], [{ x: 100, y: 100 }, { x: 110, y: 100 }, { x: 110, y: 110 }, { x: 100, y: 110 }, { x: 100, y: 100 }]]) assert.ok("error" in api.prepareFreeLoop(raw));
const ellipse = Array.from({ length: 81 }, (_, i) => ({ x: 400 + 100 * Math.cos(i * Math.PI / 40), y: 300 + 50 * Math.sin(i * Math.PI / 40) }));
assert.ok(!("error" in api.prepareFreeLoop(ellipse)));
assert.ok("error" in api.validateFreeLoop([{ x: NaN, y: 0 }, ...rectangle.slice(1, -1)]));
assert.ok("error" in api.validateFreeLoop(Array.from({ length: 193 }, () => ({ x: 0, y: 0 }))));
for (const stage of ["sewer", "free"]) {
  const w = api.createStage(stage);
  api.addPlacedGear(w, 340, 200, 18);
  const gear = w.gears.find(g => g.placed);
  assert.equal(api.addFreeBelt(w, loop.points), null);
  const fixed = w.freeBelts[0], segments = w.segments.filter(s => s.freeBelt === fixed.id);
  assert.equal(segments.length, fixed.points.length);
  assert.ok(segments.every((s, i) => s.ax === fixed.points[i].x && s.ay === fixed.points[i].y && s.bx === fixed.points[(i + 1) % fixed.points.length].x && s.by === fixed.points[(i + 1) % fixed.points.length].y));
  api.addPlacedBelt(w, 600, 180, 800, 220);
  const roller = w.gears.find(g => g.placed && g.belt);
  api.addPlacedGear(w, roller.x - roller.r - 18, roller.y, 18);
  api.solveSpin(w.gears); api.applyBelts(w, 1 / 60);
  assert.ok(w.belts.some(b => b.id.startsWith("b") && Math.abs(b.speed) > 0));
  assert.ok(segments.every(s => s.conveyor === 0));
  const saved = api.captureSaveGame(w), restored = api.loadSaveGame(api.parseSaveGame(JSON.parse(JSON.stringify(saved))));
  assert.equal(saved.version, 3);
  assert.equal(JSON.stringify(restored.freeBelts[0].points), JSON.stringify(fixed.points));
  assert.equal(restored.freeBelts[0].length, fixed.length);
  assert.ok(api.parseSaveGame({ ...saved, version: 1, placedParts: saved.placedParts.filter(p => p.type !== "freeBelt") }));
  const corrupt = JSON.parse(JSON.stringify(saved)); corrupt.placedParts.find(p => p.type === "freeBelt").length += 10;
  assert.equal(api.parseSaveGame(corrupt), null);
  api.updateWorld(w, 1 / 60);
  assert.equal(JSON.stringify(w.freeBelts[0].points), JSON.stringify(fixed.points));
  const hits = api.collectEraserHits(w, 400, 180, 10);
  assert.ok(hits.some(h => h.kind === "freeBelt")); api.applyEraser(w, hits);
  assert.equal(w.freeBelts.length, 0); assert.ok(w.gears.some(g => g.id === gear.id));
  assert.ok(w.belts.some(b => b.id.startsWith("b")));
  console.log(`PASS ${stage}: fixed geometry/colliders, passive loop, independent erase, v2 roundtrip/v1 compatibility, old crawler drive`);
}
for (const mode of [""]) for (const type of ["mouse", "touch"]) {
  const { api: a, context: c, events: e, windowEvents: we, event: p, world: w } = harness(type, mode);
  const slot = a.FREE_BELT_LAUNCH;
  const click = (x, y) => { e.pointerdown(p(x, y)); e.pointerup(p(x, y)); };
  click(slot.x, slot.y); assert.equal(vm.runInContext("tool", c), "freeBelt"); assert.equal(w.freeBelts, undefined);
  e.pointerdown(p(300, 180)); e.pointerdown(p(900, 200, 2)); e.pointermove(p(900, 400, 2));
  assert.equal(vm.runInContext("draft.length", c), 1);
  for (const q of rectangle.slice(1)) e.pointermove(p(q.x, q.y)); e.pointerup(p(300, 180)); assert.equal(w.freeBelts.length, 1);
  e.pointerdown(p(350, 300)); e.pointermove(p(480, 300)); e.pointerup(p(480, 300));
  assert.equal(w.freeBelts.length, 1); assert.ok(vm.runInContext("freeBeltMessage.length", c) > 0);
  e.pointerdown(p(300, 180)); e.pointermove(p(480, 180)); we.keydown({ key: "Escape" }); e.pointerup(p(300, 180)); assert.equal(w.freeBelts.length, 1);
  e.pointerdown(p(300, 180)); e.pointermove(p(480, 180)); e.pointercancel(p(480, 180)); assert.equal(w.freeBelts.length, 1);
  click(slot.x, slot.y); assert.equal(vm.runInContext("tool", c), "line");
  const previousBeltCount = w.belts.length;
  click(a.BELT_LAUNCH.x, a.BELT_LAUNCH.y); e.pointerdown(p(600, 180)); e.pointermove(p(800, 200)); e.pointerup(p(800, 200)); assert.equal(w.belts.length, previousBeltCount + 1);
  a.addFreeBelt(w, [{ x: 650, y: 330 }, { x: 950, y: 330 }, { x: 950, y: 600 }, { x: 650, y: 600 }]);
  const launcher = a.GEAR_LAUNCH[0], fingerY = 330 + launcher.r + 9 + launcher.r + 52;
  e.pointerdown(p(launcher.x, launcher.y)); e.pointermove(p(740, fingerY));
  assert.equal(vm.runInContext("dragGear.y", c), 330 + launcher.r + 5);
  e.pointerup(p(740, fingerY));
  assert.ok(w.freeBelts.at(-1).contacts.length > 0);
  // New launcher settings use the same pointer path for mouse and touch.
  const [directionControl, speedControl] = a.MOTOR_CONTROLS;
  click(directionControl.x + 20, directionControl.y + 20);
  click(speedControl.x + 20, speedControl.y + 20);
  assert.equal(a.MOTOR_SETTINGS.direction, -1); assert.equal(a.MOTOR_SETTINGS.level, 4);
  e.pointerdown(p(launcher.x, launcher.y)); e.pointermove(p(450, 450 + launcher.r + 52)); e.pointerup(p(450, 450 + launcher.r + 52));
  const configured = w.gears.at(-1); assert.equal(configured.motorKind, "motor"); assert.equal(configured.speedLevel, 4); assert.ok(configured.drive < 0);
  const followerLauncher = a.FOLLOWER_LAUNCH[0];
  e.pointerdown(p(followerLauncher.x, followerLauncher.y)); e.pointermove(p(520, 450 + followerLauncher.r + 52)); e.pointerup(p(520, 450 + followerLauncher.r + 52));
  const follower = w.gears.at(-1); assert.equal(follower.motorKind, "follower"); assert.equal(follower.drive, 0);
  const settingsBefore = a.MOTOR_SETTINGS.direction;
  click(follower.x, follower.y); assert.equal(follower.drive, 0); assert.equal(a.MOTOR_SETTINGS.direction, settingsBefore);
  const t = a.GEAR_LAUNCH_TRAY, handle = a.toolboxHandleRect();
  assert.ok(!a.hitToolboxHandle(t.x + 20, t.y - 16));
  assert.ok(!a.hitToolboxHandle(slot.x, slot.y));
  e.pointerdown(p(handle.x + handle.w / 2, handle.y + handle.h / 2)); e.pointermove(p(1000, 140)); e.pointerup(p(1000, 140));
  assert.notEqual(t.x, 1280 - t.w); assert.ok(a.hitFreeBeltLauncher(slot.x, slot.y));
  for (let i = 1; i < a.HUD_BTNS.length; i++) assert.equal(a.HUD_BTNS[i].x - a.HUD_BTNS[i - 1].x, 50);
  for (const btn of a.HUD_BTNS) if (a.hitHud(btn.x + btn.w / 2, btn.y + btn.h / 2)) assert.equal(a.hitHud(btn.x + btn.w / 2, btn.y + btn.h / 2).id, btn.id);
  for (const [width, height] of [[1024, 768], [768, 1024]]) {
    c.window.innerWidth = width; c.window.innerHeight = height; we.resize();
    const scale = Math.min(width / 1280, height / 720), ox = (width - 1280 * scale) / 2, oy = (height - 720 * scale) / 2;
    assert.ok((t.x - a.TOOLBOX_HANDLE_W) * scale + ox >= 0 && (t.x + t.w) * scale + ox <= width + 1e-5);
    assert.ok(t.y * scale + oy >= 0 && (t.y + t.h) * scale + oy <= height + 1e-5);
  }
  console.log(`PASS ${mode || "full entry"} ${type}: drawing, closure/rejection, cancellation, old crawler, panel movement/bounds`);
}
