import "./style.css";
import { blowerPreviewFromFinger, drawWorld, eraserPreviewFromFinger, gatePreviewFromFinger, gearPreviewFromFinger, hitBlowerLauncher, hitBeltLauncher, hitFreeBeltLauncher, hitEraserLauncher, hitGateLauncher, hitGearLauncher, hitMotorControl, MOTOR_SETTINGS, hitHud, hitPlacedGear, hitTruckStopLauncher, inGearLauncherTray, truckStopPreviewFromFinger, GEAR_LAUNCH_TRAY, TOOLBOX_HANDLE_W, hitToolboxHandle, moveToolbox } from "./draw";
import { ERASER_R, H, W, type StageId, type Tool, type World, type Gear } from "./model";
import { updateWorld } from "./sim";
import { addPlacedBelt, addPlacedBlower, addPlacedGear, addStroke, applyEraser, collectEraserHits, createStage, createWorld, hitPlacedBlower, placedGearDrive, removeGear, togglePlacedBlowerAngle, togglePlacedGearDrive } from "./world";
import { addPlacedGate, hitGateSwitch, hitPlacedGate, toggleGateAngle, toggleGateOpen } from "./gate";
import { addRecvTruckStop, hitRecvTruckStop, setRecvTruckStopInlet, stageHasRecvTruck, stagePlacesRecvTruckStops, toggleRecvTruck } from "./recvTruck";
import { createSaveUi } from "./saveUi";
import { addFreeBelt, prepareFreeLoop, syncFreeBeltContacts } from "./freeBelt";
import { gearPlacementAllowed, resolveGearPlacement } from "./beltGearContact";
import { releaseSandboxBasket } from "./sandbox";
import { hitWashControl, pourWash, toggleWashPower } from "./wash";
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
let world: World = createWorld();
let tool: Tool = "line";
let view = { scale: 1, ox: 0, oy: 0 };
let draft: {
    x: number;
    y: number;
}[] | null = null;
let dragGear: {
    x: number;
    y: number;
    r: number;
    drive: number;
    motorKind?: Gear["motorKind"];
    speedLevel?: Gear["speedLevel"];
    frictionContact?: boolean;
    motorFrictionContact?: boolean;
} | null = null;
let dragEraser: {
    x: number;
    y: number;
    r: number;
} | null = null;
let dragBlower: {
    x: number;
    y: number;
} | null = null;
let dragGate: {
    x: number;
    y: number;
    angle: number;
} | null = null;
let dragTruckStop: {
    x: number;
    y: number;
    id?: number;
} | null = null;
let gearPress: {
    id: number;
    r: number;
    drive: number;
    motorKind?: Gear["motorKind"];
    speedLevel?: Gear["speedLevel"];
    x0: number;
    y0: number;
} | null = null;
let blowerPress: {
    id: number;
    x0: number;
    y0: number;
} | null = null;
let gatePress: {
    id: number;
} | null = null;
let gateSwitchPress: {
    id: number;
} | null = null;
let truckStopPress: {
    id: number;
    x0: number;
    y0: number;
} | null = null;
let pointerDown = false;
let ignoreStroke = false;
let last = performance.now();
let saveOpen = false;
let freeBeltMessage = "";
const TOOLBOX_KEY = "chunball.remix.toolbox.position";
let panelDrag: {
    id: number;
    dx: number;
    dy: number;
} | null = null;
let activePointer: number | null = null;
try {
    const saved = JSON.parse(localStorage.getItem(TOOLBOX_KEY) || "null");
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y))
        moveToolbox(saved.x, saved.y);
}
catch { }
function saveToolbox(): void {
    try {
        localStorage.setItem(TOOLBOX_KEY, JSON.stringify({ x: GEAR_LAUNCH_TRAY.x, y: GEAR_LAUNCH_TRAY.y }));
    }
    catch { }
}
function constrainToolbox(x: number, y: number): void {
    const t = GEAR_LAUNCH_TRAY;
    const left = -view.ox / view.scale;
    const top = -view.oy / view.scale;
    const right = (window.innerWidth - view.ox) / view.scale;
    const bottom = (window.innerHeight - view.oy) / view.scale;
    moveToolbox(Math.max(left + TOOLBOX_HANDLE_W, Math.min(right - t.w, x)), Math.max(top, Math.min(bottom - t.h, y)));
}
const GEAR_DRAG_SLOP = 10;
const saveUi = createSaveUi({
    getWorld: () => world,
    setWorld: (next) => {
        world = next;
        clearTransient();
    },
    onOpenChange: (open) => {
        saveOpen = open;
        if (open)
            clearTransient();
    },
});
function layout(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    canvas.width = Math.floor(sw * dpr);
    canvas.height = Math.floor(sh * dpr);
    canvas.style.width = `${sw}px`;
    canvas.style.height = `${sh}px`;
    const scale = Math.min(sw / W, sh / H);
    view = {
        scale,
        ox: (sw - W * scale) / 2,
        oy: (sh - H * scale) / 2,
    };
    constrainToolbox(GEAR_LAUNCH_TRAY.x, GEAR_LAUNCH_TRAY.y);
    saveToolbox();
}
function toWorld(clientX: number, clientY: number): {
    x: number;
    y: number;
} {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
        x: (sx - view.ox) / view.scale,
        y: (sy - view.oy) / view.scale,
    };
}
function clearTransient(): void {
    freeBeltMessage = "";
    panelDrag = null;
    activePointer = null;
    pointerDown = false;
    draft = null;
    dragGear = null;
    dragEraser = null;
    dragBlower = null;
    dragGate = null;
    dragTruckStop = null;
    gearPress = null;
    blowerPress = null;
    gatePress = null;
    gateSwitchPress = null;
    truckStopPress = null;
    tool = "line";
}
function restart(): void {
    world = createStage(world.stage);
    clearTransient();
}
function switchStage(stage: StageId): void {
    if (world.stage === stage)
        return;
    world = createStage(stage);
    clearTransient();
}
function paint(): void {
    syncFreeBeltContacts(world);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    drawWorld(ctx, world, tool, draft, dragGear, dragEraser, dragBlower, dragGate, dragTruckStop);
    if (tool === "freeBelt" && freeBeltMessage) {
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#111";
        ctx.fillRect(W / 2 - 260, H - 42, 520, 30);
        ctx.fillStyle = "#fff";
        ctx.fillText(freeBeltMessage, W / 2, H - 21);
        ctx.textAlign = "start";
    }
    ctx.restore();
}
function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!saveOpen)
        updateWorld(world, dt);
    paint();
    (window as unknown as {
        __chunball?: {
            world: () => World;
            update: (dt: number) => void;
            paint: () => void;
        };
    }).__chunball = {
        world: () => world,
        update: (dt: number) => updateWorld(world, dt),
        paint,
    };
    requestAnimationFrame(frame);
}
function beginGearDragFromPress(fingerX: number, fingerY: number): void {
    if (!gearPress)
        return;
    const frictionContact = world.gears.find(g => g.id === gearPress!.id)?.frictionContact ?? false;
    const motorFrictionContact = world.gears.find(g => g.id === gearPress!.id)?.motorFrictionContact ?? false;
    removeGear(world, gearPress.id);
    const preview = gearPreviewFromFinger(fingerX, fingerY, gearPress.r);
    dragGear = {
        x: preview.x,
        y: preview.y,
        r: gearPress.r,
        drive: gearPress.drive,
        motorKind: gearPress.motorKind,
        speedLevel: gearPress.speedLevel,
        frictionContact,
        motorFrictionContact,
    };
    Object.assign(dragGear, resolveGearPlacement(world, dragGear));
    gearPress = null;
}
function beginTruckStopDragFromPress(fingerX: number, fingerY: number): void {
    if (!truckStopPress)
        return;
    const preview = truckStopPreviewFromFinger(fingerX, fingerY);
    dragTruckStop = { x: preview.x, y: preview.y, id: truckStopPress.id };
    truckStopPress = null;
}
function placementOnStage(finger: {
    x: number;
    y: number;
}, preview: {
    x: number;
    y: number;
}): boolean {
    return (preview.x >= 0 &&
        preview.x <= W &&
        preview.y >= 0 &&
        preview.y <= H &&
        !inGearLauncherTray(finger.x, finger.y) &&
        !inGearLauncherTray(preview.x, preview.y) &&
        !hitHud(preview.x, preview.y, world));
}
canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (saveOpen || activePointer !== null)
        return;
    activePointer = e.pointerId;
    try {
        canvas.setPointerCapture(e.pointerId);
    }
    catch {
    }
    const p = toWorld(e.clientX, e.clientY);
    pointerDown = true;
    ignoreStroke = false;
    gearPress = null;
    blowerPress = null;
    gatePress = null;
    gateSwitchPress = null;
    truckStopPress = null;
    if (hitToolboxHandle(p.x, p.y)) {
        ignoreStroke = true;
        panelDrag = { id: e.pointerId, dx: p.x - GEAR_LAUNCH_TRAY.x, dy: p.y - GEAR_LAUNCH_TRAY.y };
        return;
    }
    if (hitBeltLauncher(p.x, p.y)) {
        ignoreStroke = true;
        tool = "belt";
        return;
    }
    if (hitFreeBeltLauncher(p.x, p.y)) {
        ignoreStroke = true;
        tool = tool === "freeBelt" ? "line" : "freeBelt";
        freeBeltMessage = "始点へ戻って閉じる・アイコン再タップで終了";
        return;
    }
    if (hitEraserLauncher(p.x, p.y)) {
        ignoreStroke = true;
        const preview = eraserPreviewFromFinger(p.x, p.y);
        dragEraser = { x: preview.x, y: preview.y, r: ERASER_R };
        return;
    }
    if (hitBlowerLauncher(p.x, p.y)) {
        ignoreStroke = true;
        const preview = blowerPreviewFromFinger(p.x, p.y);
        dragBlower = { x: preview.x, y: preview.y };
        return;
    }
    if (hitGateLauncher(world, p.x, p.y)) {
        ignoreStroke = true;
        const preview = gatePreviewFromFinger(p.x, p.y);
        dragGate = { x: preview.x, y: preview.y, angle: 0 };
        return;
    }
    if (hitTruckStopLauncher(world, p.x, p.y)) {
        ignoreStroke = true;
        const preview = truckStopPreviewFromFinger(p.x, p.y);
        dragTruckStop = { x: preview.x, y: preview.y };
        return;
    }
    if (hitMotorControl(p.x, p.y)) {
        ignoreStroke = true;
        return;
    }
    const grab = hitGearLauncher(p.x, p.y);
    if (grab !== null) {
        const grabR = grab.r;
        ignoreStroke = true;
        const preview = gearPreviewFromFinger(p.x, p.y, grabR);
        dragGear = {
            x: preview.x,
            y: preview.y,
            r: grabR,
            drive: grab.motorKind === "follower" ? 0 : placedGearDrive(grabR, MOTOR_SETTINGS.direction, MOTOR_SETTINGS.level),
            motorKind: grab.motorKind,
            speedLevel: grab.motorKind === "motor" ? MOTOR_SETTINGS.level : undefined,
        };
        Object.assign(dragGear, resolveGearPlacement(world, dragGear));
        return;
    }
    if (inGearLauncherTray(p.x, p.y)) {
        ignoreStroke = true;
        return;
    }
    const btn = hitHud(p.x, p.y, world);
    if (btn) {
        ignoreStroke = true;
        if (btn.id === "line")
            tool = "line";
        else if (btn.id === "restart")
            restart();
        else if (btn.id === "save")
            saveUi.open();
        else if (btn.id === "sewer" || btn.id === "free" || btn.id === "sandbox" || btn.id === "wash")
            switchStage(btn.id);
        else if (btn.id === "release")
            releaseSandboxBasket(world);
        else if (btn.id === "truck") {
            if (world.stage === "free" && world.recvTruckStops.length === 0) {
                tool = tool === "truckStop" ? "line" : "truckStop";
            }
            else if (stageHasRecvTruck(world.stage)) {
                toggleRecvTruck(world);
            }
        }
        return;
    }
    if (world.stage === "wash") {
        const washHit = hitWashControl(world, p.x, p.y);
        if (washHit) {
            ignoreStroke = true;
            if (washHit === "power")
                toggleWashPower(world);
            else
                pourWash(world);
            return;
        }
    }
    if (tool === "truckStop" && stagePlacesRecvTruckStops(world.stage)) {
        ignoreStroke = true;
        const preview = truckStopPreviewFromFinger(p.x, p.y);
        dragTruckStop = { x: preview.x, y: preview.y };
        return;
    }
    if (tool === "freeBelt") {
        draft = [p];
        freeBeltMessage = "始点の丸へ戻って離すと確定";
        return;
    }
    const placedBlower = hitPlacedBlower(world, p.x, p.y);
    if (placedBlower) {
        ignoreStroke = true;
        blowerPress = { id: placedBlower.id, x0: p.x, y0: p.y };
        return;
    }
    const gateSwitch = hitGateSwitch(world, p.x, p.y);
    if (gateSwitch) {
        ignoreStroke = true;
        gateSwitchPress = { id: gateSwitch.id };
        return;
    }
    const placedGate = hitPlacedGate(world, p.x, p.y);
    if (placedGate) {
        ignoreStroke = true;
        gatePress = { id: placedGate.id };
        return;
    }
    const placed = hitPlacedGear(world, p.x, p.y);
    if (placed) {
        ignoreStroke = true;
        gearPress = {
            id: placed.id,
            r: placed.r,
            drive: placed.drive,
            motorKind: placed.motorKind,
            speedLevel: placed.speedLevel,
            x0: p.x,
            y0: p.y,
        };
        return;
    }
    const placedStop = hitRecvTruckStop(world, p.x, p.y);
    if (placedStop) {
        ignoreStroke = true;
        truckStopPress = { id: placedStop.id, x0: p.x, y0: p.y };
        return;
    }
    if (tool === "line" || tool === "belt")
        draft = [p];
}, { passive: false });
canvas.addEventListener("pointermove", (e) => {
    e.preventDefault();
    if (saveOpen || e.pointerId !== activePointer)
        return;
    const p = toWorld(e.clientX, e.clientY);
    if (panelDrag) {
        constrainToolbox(p.x - panelDrag.dx, p.y - panelDrag.dy);
        return;
    }
    if (gearPress) {
        if (Math.hypot(p.x - gearPress.x0, p.y - gearPress.y0) >= GEAR_DRAG_SLOP) {
            beginGearDragFromPress(p.x, p.y);
        }
        return;
    }
    if (truckStopPress) {
        if (Math.hypot(p.x - truckStopPress.x0, p.y - truckStopPress.y0) >= GEAR_DRAG_SLOP) {
            beginTruckStopDragFromPress(p.x, p.y);
        }
        return;
    }
    if (blowerPress) {
        return;
    }
    if (gatePress || gateSwitchPress) {
        return;
    }
    if (dragEraser) {
        const preview = eraserPreviewFromFinger(p.x, p.y);
        dragEraser.x = preview.x;
        dragEraser.y = preview.y;
        return;
    }
    if (dragBlower) {
        const preview = blowerPreviewFromFinger(p.x, p.y);
        dragBlower.x = preview.x;
        dragBlower.y = preview.y;
        return;
    }
    if (dragGate) {
        const preview = gatePreviewFromFinger(p.x, p.y);
        dragGate.x = preview.x;
        dragGate.y = preview.y;
        return;
    }
    if (dragTruckStop) {
        const preview = truckStopPreviewFromFinger(p.x, p.y);
        dragTruckStop.x = preview.x;
        dragTruckStop.y = preview.y;
        if (dragTruckStop.id !== undefined && placementOnStage(p, preview)) {
            setRecvTruckStopInlet(world, dragTruckStop.id, preview.x, preview.y);
        }
        return;
    }
    if (dragGear) {
        const raw = gearPreviewFromFinger(p.x, p.y, dragGear.r);
        Object.assign(dragGear, resolveGearPlacement(world, { ...dragGear, ...raw }));
        return;
    }
    if (!pointerDown || ignoreStroke)
        return;
    if ((tool === "line" || tool === "belt" || tool === "freeBelt") && draft) {
        if (tool === "belt") {
            draft[1] = p;
        }
        else {
            const lastPt = draft[draft.length - 1];
            if (Math.hypot(p.x - lastPt.x, p.y - lastPt.y) >= 8 && (tool !== "freeBelt" || draft.length <= 1024))
                draft.push(p);
        }
    }
}, { passive: false });
canvas.addEventListener("pointerup", (e) => {
    if (e.pointerId !== activePointer)
        return;
    activePointer = null;
    if (panelDrag) {
        panelDrag = null;
        pointerDown = false;
        ignoreStroke = false;
        saveToolbox();
        return;
    }
    if (saveOpen)
        return;
    const p = toWorld(e.clientX, e.clientY);
    if (blowerPress) {
        togglePlacedBlowerAngle(world, blowerPress.id);
        blowerPress = null;
    }
    else if (gateSwitchPress) {
        toggleGateOpen(world, gateSwitchPress.id);
        gateSwitchPress = null;
    }
    else if (gatePress) {
        toggleGateAngle(world, gatePress.id);
        gatePress = null;
    }
    else if (gearPress) {
        togglePlacedGearDrive(world, gearPress.id);
        gearPress = null;
    }
    else if (truckStopPress) {
        truckStopPress = null;
    }
    else if (dragEraser) {
        const preview = eraserPreviewFromFinger(p.x, p.y);
        const onStage = !inGearLauncherTray(p.x, p.y) &&
            !inGearLauncherTray(preview.x, preview.y) &&
            !hitHud(preview.x, preview.y, world);
        if (onStage) {
            applyEraser(world, collectEraserHits(world, preview.x, preview.y, dragEraser.r));
        }
        dragEraser = null;
    }
    else if (dragBlower) {
        const preview = blowerPreviewFromFinger(p.x, p.y);
        const onStage = preview.x >= 0 &&
            preview.x <= W &&
            preview.y >= 0 &&
            preview.y <= H &&
            !inGearLauncherTray(p.x, p.y) &&
            !inGearLauncherTray(preview.x, preview.y) &&
            !hitHud(preview.x, preview.y, world);
        if (onStage)
            addPlacedBlower(world, preview.x, preview.y);
        dragBlower = null;
    }
    else if (dragGate) {
        const preview = gatePreviewFromFinger(p.x, p.y);
        const onStage = preview.x >= 0 &&
            preview.x <= W &&
            preview.y >= 0 &&
            preview.y <= H &&
            !inGearLauncherTray(p.x, p.y) &&
            !inGearLauncherTray(preview.x, preview.y) &&
            !hitHud(preview.x, preview.y, world);
        if (onStage)
            addPlacedGate(world, preview.x, preview.y, dragGate.angle);
        dragGate = null;
    }
    else if (dragTruckStop) {
        const preview = truckStopPreviewFromFinger(p.x, p.y);
        const onStage = placementOnStage(p, preview);
        if (dragTruckStop.id !== undefined) {
            if (onStage)
                setRecvTruckStopInlet(world, dragTruckStop.id, preview.x, preview.y);
        }
        else if (onStage) {
            const stop = addRecvTruckStop(world, preview.x, preview.y);
            if (stop && tool === "truckStop") {
                toggleRecvTruck(world);
                tool = "line";
            }
        }
        dragTruckStop = null;
    }
    else if (dragGear) {
        const raw = gearPreviewFromFinger(p.x, p.y, dragGear.r);
        const preview = resolveGearPlacement(world, { ...dragGear, ...raw });
        const onStage = preview.x >= 0 &&
            preview.x <= W &&
            preview.y >= 0 &&
            preview.y <= H &&
            !inGearLauncherTray(p.x, p.y) &&
            !inGearLauncherTray(preview.x, preview.y) &&
            !hitHud(preview.x, preview.y, world);
        if (onStage && gearPlacementAllowed(world, { ...dragGear, ...preview }))
            addPlacedGear(world, preview.x, preview.y, dragGear.r, dragGear.drive, dragGear.motorKind ? { motorKind: dragGear.motorKind, speedLevel: dragGear.speedLevel, frictionContact: dragGear.frictionContact, motorFrictionContact: dragGear.motorFrictionContact } : undefined);
        syncFreeBeltContacts(world);
        dragGear = null;
    }
    else if (!ignoreStroke && tool === "freeBelt" && draft) {
        const end = draft[draft.length - 1];
        if (Math.hypot(p.x - end.x, p.y - end.y) > 1)
            draft.push(p);
        if (draft.some(p => inGearLauncherTray(p.x, p.y) || hitHud(p.x, p.y, world))) {
            freeBeltMessage = "ツールボックス・ボタンの外に描いてください";
        }
        else {
            const result = prepareFreeLoop(draft);
            freeBeltMessage = "error" in result ? result.error : (addFreeBelt(world, result.points) ?? "輪を設置しました。ギアを2個以上接続すると動きます");
        }
    }
    else if (!ignoreStroke && tool === "belt" && draft && draft.length >= 1) {
        const a = draft[0];
        const b = draft[draft.length - 1] ?? p;
        addPlacedBelt(world, a.x, a.y, b.x, b.y);
    }
    else if (!ignoreStroke && tool === "line" && draft) {
        const lastPt = draft[draft.length - 1];
        if (Math.hypot(p.x - lastPt.x, p.y - lastPt.y) > 4)
            draft.push(p);
        addStroke(world, draft);
    }
    draft = null;
    pointerDown = false;
    ignoreStroke = false;
});
canvas.addEventListener("pointercancel", (e) => {
    if (e.pointerId !== activePointer)
        return;
    activePointer = null;
    if (tool === "freeBelt")
        freeBeltMessage = "描画をキャンセルしました";
    panelDrag = null;
    saveToolbox();
    draft = null;
    dragGear = null;
    dragEraser = null;
    dragBlower = null;
    dragGate = null;
    dragTruckStop = null;
    gearPress = null;
    blowerPress = null;
    gatePress = null;
    gateSwitchPress = null;
    truckStopPress = null;
    pointerDown = false;
    ignoreStroke = false;
});
window.addEventListener("resize", layout);
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tool === "freeBelt") {
        draft = null;
        pointerDown = false;
        ignoreStroke = true;
        freeBeltMessage = "描画をキャンセルしました";
    }
});
layout();
requestAnimationFrame(frame);
