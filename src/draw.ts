import { DEBUG_PATHS, ERASER_R, GEAR_LAUNCH_RS, GRAIN_R, H, MIN_PLACED_BELT_LEN, PLACED_BELT_R, W, type Gate, type Gear, type Particle, type Segment, type StageId, type Tool, type World } from "./model";
import { BALL_COLORS, drawBallTrack, stageBallColor } from "./ballLook";
import { SL, SED_SWIRL_PIPE } from "./sewer";
import { FL } from "./free";
import { drawSandbox } from "./sandboxDraw";
import { drawWash, drawWashLaundry } from "./washDraw";
import { washGearMesh } from "./wash";
import { collectEraserHits, placedGearDrive } from "./world";
import { layoutRecvTruck, stageHasRecvTruck } from "./recvTruck";
import { GATE, gateSwitchPos, gateWall } from "./gate";
import { SHOW_BLOWER_LAUNCHER } from "./appMode";
import { FREE_BELT_CLOSE_R, freeBeltSnap } from "./freeBelt";
import { gearPlacementAllowed, outerBeltSnap } from "./beltGearContact";
const MACHINE = "#d6d6d6";
const DIM = "#8d8d8d";
const FAINT = "#5c5c5c";
export type GearDrag = {
    x: number;
    y: number;
    r: number;
    drive: number;
    motorKind?: "motor" | "follower";
    speedLevel?: 1 | 2 | 3 | 4 | 5;
    frictionContact?: boolean;
    motorFrictionContact?: boolean;
};
export const MOTOR_SETTINGS: {
    direction: number;
    level: 1 | 2 | 3 | 4 | 5;
} = { direction: 1, level: 3 };
const SPEED_LABELS = ["極低速", "低速", "中速", "高速", "極高速"];
export type EraserDrag = {
    x: number;
    y: number;
    r: number;
};
export type BlowerDrag = {
    x: number;
    y: number;
};
export type GateDrag = {
    x: number;
    y: number;
    angle: number;
};
export type TruckStopDrag = {
    x: number;
    y: number;
    id?: number;
};
const LAUNCH_PAD = 8;
const LAUNCH_GAP = 10;
const ERASER_ICON_R = 22;
const ERASER_TO_GEAR = 26;
const BELT_SLOT_H = 52;
const BLOWER_LAUNCH_GAP = 18;
const BLOWER_ICON_R = 16;
const GATE_ICON_R = 16;
const GATE_LAUNCH_GAP = 18;
const SHOW_GATE_SLOT = !false;
const SHOW_TRUCK_STOP_SLOT = !false;
const PARTS_LAUNCH = (() => {
    const maxR = GEAR_LAUNCH_RS[GEAR_LAUNCH_RS.length - 1];
    const w = 208;
    const gearsH = GEAR_LAUNCH_RS.reduce((a, r) => a + r * 2, 0) +
        LAUNCH_GAP * (GEAR_LAUNCH_RS.length - 1);
    const blowerH = SHOW_BLOWER_LAUNCHER ? BLOWER_LAUNCH_GAP + BLOWER_ICON_R * 2 : 0;
    const gateH = SHOW_GATE_SLOT ? GATE_LAUNCH_GAP + GATE_ICON_R * 2 : 0;
    const truckStopH = SHOW_TRUCK_STOP_SLOT ? GATE_LAUNCH_GAP + GATE_ICON_R * 2 : 0;
    const h = LAUNCH_PAD * 2 +
        ERASER_ICON_R * 2 +
        ERASER_TO_GEAR +
        BELT_SLOT_H +
        76 +
        gearsH +
        blowerH +
        gateH +
        truckStopH;
    const x = W - w;
    const y = H - 8 - h;
    const cx = x + w / 2;
    const eraser = { x: cx, y: y + LAUNCH_PAD + ERASER_ICON_R, r: ERASER_ICON_R };
    const belt = { x: cx - 28, y: eraser.y + ERASER_ICON_R + 34, w: 48, h: 40 };
    const freeBelt = { x: cx + 28, y: belt.y, w: 48, h: 40 };
    let gy = eraser.y + ERASER_ICON_R + ERASER_TO_GEAR + BELT_SLOT_H + 76;
    const gears = GEAR_LAUNCH_RS.map((r) => {
        const item = { r, x: x + 54, y: gy + r };
        gy += r * 2 + LAUNCH_GAP;
        return item;
    });
    const blower = {
        x: cx,
        y: gy + BLOWER_LAUNCH_GAP + BLOWER_ICON_R,
        r: BLOWER_ICON_R,
    };
    const gateY0 = SHOW_BLOWER_LAUNCHER ? blower.y + BLOWER_ICON_R : gy;
    const gate = SHOW_GATE_SLOT
        ? { x: cx, y: gateY0 + GATE_LAUNCH_GAP + GATE_ICON_R, r: GATE_ICON_R }
        : null;
    const truckStopY0 = gate ? gate.y + GATE_ICON_R : gateY0;
    const truckStop = SHOW_TRUCK_STOP_SLOT
        ? { x: cx, y: truckStopY0 + GATE_LAUNCH_GAP + GATE_ICON_R, r: GATE_ICON_R }
        : null;
    return { tray: { x, y, w, h }, eraser, belt, freeBelt, gears, blower, gate, truckStop };
})();
export const GEAR_LAUNCH = PARTS_LAUNCH.gears;
export const FOLLOWER_LAUNCH = GEAR_LAUNCH.map(g => ({ ...g, x: PARTS_LAUNCH.tray.x + 154 }));
export const MOTOR_CONTROLS = [
    { x: PARTS_LAUNCH.tray.x + 8, y: GEAR_LAUNCH[0].y - GEAR_LAUNCH[0].r - 76, w: 92, h: 44 },
    { x: PARTS_LAUNCH.tray.x + 108, y: GEAR_LAUNCH[0].y - GEAR_LAUNCH[0].r - 76, w: 92, h: 44 },
];
export const GEAR_LAUNCH_TRAY = PARTS_LAUNCH.tray;
export const ERASER_LAUNCH = PARTS_LAUNCH.eraser;
export const BELT_LAUNCH = PARTS_LAUNCH.belt;
export const FREE_BELT_LAUNCH = PARTS_LAUNCH.freeBelt;
export const BLOWER_LAUNCH = PARTS_LAUNCH.blower;
export const GATE_LAUNCH = PARTS_LAUNCH.gate;
export const TRUCK_STOP_LAUNCH = PARTS_LAUNCH.truckStop;
export const TOOLBOX_HANDLE_W = 44;
export const TOOLBOX_HANDLE_H = 64;
export function toolboxHandleRect(): {
    x: number;
    y: number;
    w: number;
    h: number;
} {
    const t = GEAR_LAUNCH_TRAY;
    return { x: t.x - TOOLBOX_HANDLE_W, y: t.y + (t.h - TOOLBOX_HANDLE_H) / 2, w: TOOLBOX_HANDLE_W, h: TOOLBOX_HANDLE_H };
}
export function moveToolbox(x: number, y: number): void {
    const t = GEAR_LAUNCH_TRAY;
    const dx = x - t.x;
    const dy = y - t.y;
    for (const item of [t, ERASER_LAUNCH, BELT_LAUNCH, FREE_BELT_LAUNCH, ...GEAR_LAUNCH, ...FOLLOWER_LAUNCH, ...MOTOR_CONTROLS, BLOWER_LAUNCH, GATE_LAUNCH, TRUCK_STOP_LAUNCH]) {
        if (item) {
            item.x += dx;
            item.y += dy;
        }
    }
}
export function hitToolboxHandle(x: number, y: number): boolean {
    const h = toolboxHandleRect();
    return x >= h.x && x < h.x + h.w && y >= h.y && y <= h.y + h.h;
}
export function showGateLauncher(stage: StageId): boolean {
    return SHOW_GATE_SLOT && (stage === "free" || stage === "sewer" || stage === "sandbox");
}
export function showTruckStopLauncher(stage: StageId): boolean {
    return SHOW_TRUCK_STOP_SLOT && (stage === "free" || stage === "sandbox");
}
export function gearPreviewFromFinger(fingerX: number, fingerY: number, r: number): {
    x: number;
    y: number;
} {
    return { x: fingerX, y: fingerY - r - 52 };
}
export function eraserPreviewFromFinger(fingerX: number, fingerY: number): {
    x: number;
    y: number;
} {
    return { x: fingerX, y: fingerY - ERASER_R - 40 };
}
export function hitMotorControl(x: number, y: number): boolean {
    const index = MOTOR_CONTROLS.findIndex(c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
    if (index < 0)
        return false;
    if (index === 0)
        MOTOR_SETTINGS.direction *= -1;
    else
        MOTOR_SETTINGS.level = (MOTOR_SETTINGS.level % 5 + 1) as 1 | 2 | 3 | 4 | 5;
    return true;
}
export function hitGearLauncher(x: number, y: number): {
    r: number;
    motorKind: "motor" | "follower";
} | null {
    for (const [items, motorKind] of [[GEAR_LAUNCH, "motor"], [FOLLOWER_LAUNCH, "follower"]] as const)
        for (const g of items) {
            if (Math.abs(x - g.x) <= 46 && Math.abs(y - g.y) <= g.r + 4)
                return { r: g.r, motorKind };
        }
    return null;
}
export function hitEraserLauncher(x: number, y: number): boolean {
    const e = ERASER_LAUNCH;
    return Math.hypot(x - e.x, y - e.y) <= e.r + 12;
}
export function hitBeltLauncher(x: number, y: number): boolean {
    const b = BELT_LAUNCH;
    return Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2;
}
export function hitFreeBeltLauncher(x: number, y: number): boolean {
    const b = FREE_BELT_LAUNCH;
    return Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2;
}
export function hitBlowerLauncher(x: number, y: number): boolean {
    if (!SHOW_BLOWER_LAUNCHER)
        return false;
    const b = BLOWER_LAUNCH;
    return Math.hypot(x - b.x, y - b.y) <= b.r + 12;
}
export function blowerPreviewFromFinger(fingerX: number, fingerY: number): {
    x: number;
    y: number;
} {
    return { x: fingerX, y: fingerY - 48 };
}
export function hitGateLauncher(world: World, x: number, y: number): boolean {
    if (!showGateLauncher(world.stage) || !GATE_LAUNCH)
        return false;
    const g = GATE_LAUNCH;
    return Math.hypot(x - g.x, y - g.y) <= g.r + 12;
}
export function gatePreviewFromFinger(fingerX: number, fingerY: number): {
    x: number;
    y: number;
} {
    return { x: fingerX, y: fingerY - 52 };
}
export function hitTruckStopLauncher(world: World, x: number, y: number): boolean {
    if (!showTruckStopLauncher(world.stage) || !TRUCK_STOP_LAUNCH)
        return false;
    const g = TRUCK_STOP_LAUNCH;
    return Math.hypot(x - g.x, y - g.y) <= g.r + 12;
}
export function truckStopPreviewFromFinger(fingerX: number, fingerY: number): {
    x: number;
    y: number;
} {
    return { x: fingerX, y: fingerY - 40 };
}
export function inGearLauncherTray(x: number, y: number): boolean {
    const t = GEAR_LAUNCH_TRAY;
    return hitToolboxHandle(x, y) || (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h);
}
export function hitPlacedGear(world: World, x: number, y: number): Gear | null {
    let best: Gear | null = null;
    let bestD = Infinity;
    for (const g of world.gears) {
        if (!g.placed || g.spin !== "gear")
            continue;
        const d = Math.hypot(g.x - x, g.y - y);
        if (d <= g.r + 6 && d < bestD) {
            best = g;
            bestD = d;
        }
    }
    return best;
}
export type HudBtn = {
    id: "line" | "restart" | "save" | "sewer" | "free" | "sandbox" | "wash" | "release" | "truck";
    x: number;
    y: number;
    w: number;
    h: number;
};
export const STAGE_BTNS: HudBtn[] = [
    { id: "sewer", x: 248, y: 12, w: 40, h: 40 },
    { id: "free", x: 298, y: 12, w: 40, h: 40 },
    { id: "sandbox", x: 348, y: 12, w: 40, h: 40 },
    { id: "wash", x: 398, y: 12, w: 40, h: 40 },
];
export const SANDBOX_RELEASE_BTN: HudBtn = { id: "release", x: 458, y: 12, w: 40, h: 40 };
export const HUD_BTNS: HudBtn[] = (() => {
    const y = 12;
    const h = 40;
    const w = 40;
    const gap = 10;
    const ids: HudBtn["id"][] = ["line", "truck", "save", "restart"];
    return ids.map((id, i) => ({
        id,
        x: W - 16 - (ids.length - i) * (w + gap) + gap,
        y,
        w,
        h,
    }));
})();
function strokeLine(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
}
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}
function drawGear(ctx: CanvasRenderingContext2D, g: Gear, highlight = false): void {
    const teeth = Math.max(8, Math.round(g.r / 3.2));
    const inner = g.r * 0.78;
    const hub = g.r * 0.28;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.angle);
    ctx.strokeStyle = highlight ? "#fff" : g.placed ? "#f0f0f0" : MACHINE;
    ctx.lineWidth = highlight ? 2.6 : g.placed ? 1.8 : 1.5;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2;
        const a1 = a0 + Math.PI / teeth;
        const a2 = ((i + 1) / teeth) * Math.PI * 2;
        const p0x = Math.cos(a0) * inner;
        const p0y = Math.sin(a0) * inner;
        if (i === 0)
            ctx.moveTo(p0x, p0y);
        else
            ctx.lineTo(p0x, p0y);
        ctx.lineTo(Math.cos(a0 + 0.08) * g.r, Math.sin(a0 + 0.08) * g.r);
        ctx.lineTo(Math.cos(a1 - 0.08) * g.r, Math.sin(a1 - 0.08) * g.r);
        ctx.lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
        ctx.lineTo(Math.cos(a2) * inner, Math.sin(a2) * inner);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, hub, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-hub * 0.7, 0);
    ctx.lineTo(hub * 0.7, 0);
    ctx.moveTo(0, -hub * 0.7);
    ctx.lineTo(0, hub * 0.7);
    ctx.stroke();
    ctx.restore();
    if (highlight) {
        ctx.save();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}
function drawBall(ctx: CanvasRenderingContext2D, p: Particle, stage: StageId): void {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = stageBallColor(stage, p.color);
    ctx.globalAlpha = p.frozen ? 0.55 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    drawBallTrack(ctx, p);
}
function strokeTube(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, hw: number): void {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * hw;
    const ny = (dx / len) * hw;
    ctx.beginPath();
    ctx.moveTo(ax + nx, ay + ny);
    ctx.lineTo(bx + nx, by + ny);
    ctx.moveTo(ax - nx, ay - ny);
    ctx.lineTo(bx - nx, by - ny);
    ctx.stroke();
}
function strokeJoint(ctx: CanvasRenderingContext2D, x: number, y: number, hw: number): void {
    ctx.beginPath();
    ctx.arc(x, y, hw, 0, Math.PI * 2);
    ctx.stroke();
}
function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + 16);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w, y + 16);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x + w * 0.38, y + h - 22, w * 0.24, 22);
    ctx.stroke();
}
function drawSewer(ctx: CanvasRenderingContext2D, world: World): void {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const sc = SL.screen;
    const sd = SL.sed;
    const sw = SL.swirl;
    const fn = SL.final;
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1.2;
    strokeLine(ctx, 8, 668, 1272, 668);
    roundRectPath(ctx, 430, 188, 748, 390, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(1148, 188);
    ctx.lineTo(1148, 128);
    ctx.lineTo(1170, 128);
    ctx.stroke();
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.4;
    strokeLine(ctx, 8, 156, 214, 156);
    strokeLine(ctx, 8, 168, 214, 168);
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.7;
    drawHouse(ctx, 18, 72, 64, 84);
    drawHouse(ctx, 96, 86, 58, 70);
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.5;
    strokeLine(ctx, 110, 156, 110, 168);
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.8;
    strokeTube(ctx, 110, 168, 110, 268, 18);
    strokeJoint(ctx, 110, 268, 18);
    strokeTube(ctx, 110, 268, 248, 268, 18);
    strokeJoint(ctx, 248, 268, 18);
    roundRectPath(ctx, sc.x, sc.y, sc.w, sc.h, 6);
    ctx.stroke();
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.35;
    for (let x = sc.x + 28; x < sc.x + sc.w - 16; x += 14) {
        strokeLine(ctx, x, sc.y + 6, x, sc.y + 34);
    }
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.7;
    strokeTube(ctx, 388, 268, 468, 268, 13);
    roundRectPath(ctx, sd.x, sd.y, sd.w, sd.h, 8);
    ctx.stroke();
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.2;
    strokeLine(ctx, sd.x + 18, sd.y + sd.h - 16, sd.x + sd.w - 18, sd.y + sd.h - 16);
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.7;
    for (let i = 0; i < SED_SWIRL_PIPE.points.length - 1; i++) {
        const a = SED_SWIRL_PIPE.points[i], b = SED_SWIRL_PIPE.points[i + 1];
        strokeTube(ctx, a.x, a.y, b.x, b.y, SED_SWIRL_PIPE.halfWidth);
        if (i < SED_SWIRL_PIPE.points.length - 2)
            strokeJoint(ctx, b.x, b.y, SED_SWIRL_PIPE.halfWidth);
    }
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(sw.x, sw.y);
    ctx.rotate(world.time * 1.4);
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(10, 0);
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.7;
    strokeTube(ctx, 956, 470, 1048, 502, 14);
    strokeJoint(ctx, 956, 470, 14);
    strokeJoint(ctx, 1048, 502, 14);
    roundRectPath(ctx, fn.x, fn.y, fn.w, fn.h, 8);
    ctx.stroke();
    strokeTube(ctx, 1196, 510, 1228, 516, 13);
    strokeJoint(ctx, 1228, 516, 13);
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(1224, 528);
    ctx.lineTo(1280, 548);
    ctx.stroke();
}
const TRUCK_ACCENT = "#6ea8d8";
function drawRecvTruck(ctx: CanvasRenderingContext2D, world: World): void {
    for (const truck of world.recvTrucks) {
        if (truck.status === "uncalled")
            continue;
        drawRecvTruckAt(ctx, layoutRecvTruck(truck));
    }
}
function drawRecvTruckAt(ctx: CanvasRenderingContext2D, t: ReturnType<typeof layoutRecvTruck>): void {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.8;
    for (const wx of [t.wheelFrontX, t.wheelRearX]) {
        ctx.beginPath();
        ctx.arc(wx, t.wheelY, t.wheelR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = DIM;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(wx, t.wheelY, t.wheelR * 0.42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = MACHINE;
        ctx.lineWidth = 1.8;
    }
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(t.chassisL, t.chassisY);
    ctx.lineTo(t.chassisR, t.chassisY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(t.cabL + 6, t.chassisY);
    ctx.lineTo(t.wheelFrontX, t.wheelY - 4);
    ctx.moveTo(t.bedR - 8, t.chassisY);
    ctx.lineTo(t.wheelRearX, t.wheelY - 4);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(t.bedL, t.hopBot + 8, t.bedR - t.bedL, t.chassisY - t.hopBot - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(t.cabL + 8, t.cabBot);
    ctx.lineTo(t.cabL + 3, t.cabBot - 30);
    ctx.lineTo(t.cabL + 20, t.cabTop);
    ctx.lineTo(t.cabR - 5, t.cabTop);
    ctx.lineTo(t.cabR, t.cabBot);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(t.cabL + 23, t.cabTop + 9);
    ctx.lineTo(t.cabL + 10, t.cabTop + 42);
    ctx.lineTo(t.cabL + 40, t.cabTop + 42);
    ctx.lineTo(t.cabL + 44, t.cabTop + 9);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(t.cabL + 51, t.cabTop + 9);
    ctx.lineTo(t.cabR - 9, t.cabTop + 9);
    ctx.lineTo(t.cabR - 7, t.cabTop + 48);
    ctx.lineTo(t.cabL + 49, t.cabTop + 48);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(t.cabL + 10, t.cabBot - 14, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = TRUCK_ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.hopBodyL, t.hopBot);
    ctx.lineTo(t.hopBodyL, t.hopShoulderY);
    ctx.lineTo(t.hopL, t.hopTop);
    ctx.lineTo(t.hopR, t.hopTop);
    ctx.lineTo(t.hopBodyR, t.hopShoulderY);
    ctx.lineTo(t.hopBodyR, t.hopBot);
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(t.hopL, t.hopTop);
    ctx.lineTo(t.hopR, t.hopTop);
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(t.cx - 18, t.hopTop);
    ctx.lineTo(t.cx - 14, t.hopTop + 8);
    ctx.lineTo(t.cx + 14, t.hopTop + 8);
    ctx.lineTo(t.cx + 18, t.hopTop);
    ctx.stroke();
    ctx.strokeStyle = "#4e86b4";
    ctx.lineWidth = 1.15;
    const midY = (t.hopShoulderY + t.hopBot) * 0.5;
    strokeLine(ctx, t.hopBodyL + 6, midY, t.hopBodyR - 6, midY);
    strokeLine(ctx, t.hopBodyL, t.hopShoulderY, t.hopBodyR, t.hopShoulderY);
    strokeLine(ctx, t.cx, t.hopShoulderY + 6, t.cx, t.hopBot - 6);
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.6;
    strokeLine(ctx, t.hopBodyL + 4, t.hopBot, t.hopBodyL + 4, t.chassisY);
    strokeLine(ctx, t.hopBodyR - 4, t.hopBot, t.hopBodyR - 4, t.chassisY);
    strokeLine(ctx, t.hopBodyL, t.hopBot, t.hopBodyR, t.hopBot);
    ctx.strokeStyle = TRUCK_ACCENT;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(t.hopBodyR, t.hopBot - 36);
    ctx.lineTo(t.hopBodyR + 24, t.hopBot + 8);
    ctx.lineTo(t.hopBodyR + 24, t.hopBot + 24);
    ctx.lineTo(t.hopBodyR, t.hopBot);
    ctx.stroke();
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
        const u = 0.2 + i * 0.25;
        ctx.beginPath();
        ctx.moveTo(t.hopBodyR + 3, t.hopBot - 36 + 36 * u);
        ctx.lineTo(t.hopBodyR + 21, t.hopBot + 8 + 16 * u);
        ctx.stroke();
    }
    ctx.restore();
}
function drawRecvTruckAim(ctx: CanvasRenderingContext2D, x: number, y: number, highlight = false): void {
    ctx.save();
    ctx.strokeStyle = highlight ? "#fff" : TRUCK_ACCENT;
    ctx.globalAlpha = highlight ? 1 : 0.9;
    ctx.lineWidth = highlight ? 2 : 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 16, y);
    ctx.lineTo(x + 16, y);
    ctx.stroke();
    ctx.lineWidth = highlight ? 1.6 : 1.35;
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x - 8, y + 11);
    ctx.lineTo(x + 8, y + 11);
    ctx.lineTo(x + 10, y);
    ctx.stroke();
    ctx.restore();
}
function drawTruckStopIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#6ea8d8";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-s, 2);
    ctx.lineTo(s, 2);
    ctx.stroke();
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.arc(0, 2, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 8);
    ctx.lineTo(-4, 12);
    ctx.lineTo(4, 12);
    ctx.lineTo(5, 8);
    ctx.stroke();
    ctx.restore();
}
function drawBlower(ctx: CanvasRenderingContext2D, b: {
    x: number;
    y: number;
    angle: number;
    range: number;
    mode: "planar";
    placed: boolean;
}, time: number): void {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.restore();
}
function drawSegment(ctx: CanvasRenderingContext2D, s: Segment, time: number, highlight = false): void {
    if (s.placed) {
        ctx.strokeStyle = highlight ? "#fff" : "#f2f2f2";
        ctx.lineWidth = highlight ? 4.2 : 2.4;
        ctx.setLineDash([]);
        strokeLine(ctx, s.ax, s.ay, s.bx, s.by);
        return;
    }
    if (s.conveyor !== 0) {
        ctx.strokeStyle = "#9a9a9a";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([7, 6]);
        ctx.lineDashOffset = -time * s.conveyor * 0.35;
        strokeLine(ctx, s.ax, s.ay, s.bx, s.by);
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        return;
    }
    ctx.strokeStyle = "#6e6e6e";
    ctx.lineWidth = 1.15;
    strokeLine(ctx, s.ax, s.ay, s.bx, s.by);
}
function drawHud(ctx: CanvasRenderingContext2D, world: World, tool: Tool): void {
    for (const b of STAGE_BTNS) {
        const on = world.stage === b.id;
        ctx.strokeStyle = on ? "#fff" : "#9a9a9a";
        ctx.lineWidth = on ? 2.2 : 1.4;
        roundRectPath(ctx, b.x, b.y, b.w, b.h, 8);
        if (on) {
            ctx.fillStyle = "rgba(255,255,255,0.14)";
            ctx.fill();
        }
        ctx.stroke();
        ctx.strokeStyle = on ? "#fff" : "#cfcfcf";
        ctx.lineWidth = 1.5;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        if (b.id === "sewer") {
            ctx.beginPath();
            ctx.moveTo(cx - 10, cy + 4);
            ctx.lineTo(cx - 10, cy - 2);
            ctx.lineTo(cx - 5, cy - 8);
            ctx.lineTo(cx, cy - 2);
            ctx.lineTo(cx, cy + 4);
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy + 4);
            ctx.lineTo(cx - 5, cy + 9);
            ctx.lineTo(cx + 10, cy + 9);
            ctx.stroke();
        }
        else if (b.id === "free") {
            ctx.beginPath();
            ctx.moveTo(cx - 11, cy + 8);
            ctx.lineTo(cx + 11, cy + 8);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx - 3, cy - 3, 4.2, 0, Math.PI * 2);
            ctx.stroke();
        }
        else if (b.id === "sandbox") {
            ctx.beginPath();
            ctx.moveTo(cx - 10, cy - 4);
            ctx.quadraticCurveTo(cx - 12, cy + 8, cx - 3, cy + 11);
            ctx.quadraticCurveTo(cx, cy + 13, cx + 3, cy + 11);
            ctx.quadraticCurveTo(cx + 12, cy + 8, cx + 10, cy - 4);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(cx, cy - 4, 10, 3, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        else if (b.id === "wash") {
            ctx.strokeRect(cx - 9, cy - 2, 18, 14);
            ctx.beginPath();
            ctx.moveTo(cx - 9, cy - 2);
            ctx.lineTo(cx - 11, cy - 9);
            ctx.lineTo(cx + 7, cy - 9);
            ctx.stroke();
        }
    }
    if (world.stage === "sandbox") {
        drawSandboxRelease(ctx, world);
    }
    for (const b of HUD_BTNS) {
        const truckStage = stageHasRecvTruck(world.stage);
        const disabled = b.id === "truck" && !truckStage;
        const on = (b.id === "line" && tool === "line") ||
            (b.id === "truck" && (world.recvTrucks.length > 0 || tool === "truckStop"));
        ctx.globalAlpha = disabled ? 0.35 : 1;
        ctx.strokeStyle = on ? "#fff" : "#9a9a9a";
        ctx.lineWidth = on ? 2.2 : 1.4;
        roundRectPath(ctx, b.x, b.y, b.w, b.h, 8);
        if (on) {
            ctx.fillStyle = "rgba(255,255,255,0.14)";
            ctx.fill();
        }
        ctx.stroke();
        ctx.strokeStyle = on ? "#fff" : "#cfcfcf";
        ctx.fillStyle = on ? "#fff" : "#cfcfcf";
        ctx.lineWidth = 1.6;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        if (b.id === "line") {
            ctx.beginPath();
            ctx.moveTo(cx - 10, cy + 7);
            ctx.quadraticCurveTo(cx, cy - 12, cx + 10, cy + 4);
            ctx.stroke();
        }
        else if (b.id === "truck") {
            roundRectPath(ctx, cx - 12, cy - 3, 9, 8, 1.5);
            ctx.stroke();
            roundRectPath(ctx, cx - 2, cy - 10, 13, 15, 1.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx - 8, cy + 8, 2.3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + 7, cy + 8, 2.3, 0, Math.PI * 2);
            ctx.stroke();
        }
        else if (b.id === "save") {
            roundRectPath(ctx, cx - 10, cy - 10, 20, 20, 2.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy - 10);
            ctx.lineTo(cx - 5, cy - 3);
            ctx.lineTo(cx + 5, cy - 3);
            ctx.lineTo(cx + 5, cy - 10);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - 7, cy + 2);
            ctx.lineTo(cx + 7, cy + 2);
            ctx.lineTo(cx + 7, cy + 9);
            ctx.lineTo(cx - 7, cy + 9);
            ctx.closePath();
            ctx.stroke();
        }
        else if (b.id === "restart") {
            ctx.beginPath();
            ctx.arc(cx, cy, 9, Math.PI * 0.15, Math.PI * 1.75);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + 8, cy - 7);
            ctx.lineTo(cx + 4, cy - 1);
            ctx.lineTo(cx + 12, cy - 2);
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}
function drawSandboxRelease(ctx: CanvasRenderingContext2D, world: World): void {
    const b = SANDBOX_RELEASE_BTN;
    const spent = world.sandbox?.released === true;
    ctx.save();
    ctx.globalAlpha = spent ? 0.35 : 1;
    ctx.strokeStyle = spent ? "#9a9a9a" : "#fff";
    ctx.lineWidth = spent ? 1.4 : 2.2;
    roundRectPath(ctx, b.x, b.y, b.w, b.h, 8);
    if (!spent) {
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fill();
    }
    ctx.stroke();
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const dots = [
        { x: -6, y: 3, c: BALL_COLORS[0] },
        { x: 5, y: 4, c: BALL_COLORS[2] },
        { x: 0, y: -6, c: BALL_COLORS[5] },
    ];
    for (const d of dots) {
        ctx.fillStyle = d.c;
        ctx.beginPath();
        ctx.arc(cx + d.x, cy + d.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
export function hitHud(x: number, y: number, world?: World): HudBtn | null {
    {
        for (const b of STAGE_BTNS) {
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
                return b;
        }
        if (world?.stage === "sandbox") {
            const b = SANDBOX_RELEASE_BTN;
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
                return b;
        }
    }
    for (const b of HUD_BTNS) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
            return b;
    }
    return null;
}
function drawEraserIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.45);
    ctx.strokeStyle = "#d0d0d0";
    ctx.lineWidth = 1.7;
    const w = s * 1.55;
    const h = s * 0.95;
    roundRectPath(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.22, -h / 2);
    ctx.lineTo(w * 0.22, h / 2);
    ctx.stroke();
    ctx.restore();
}
function drawGateIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#d0d0d0";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-s, 2);
    ctx.lineTo(s * 0.25, 2);
    ctx.stroke();
    ctx.lineWidth = 1.35;
    roundRectPath(ctx, s * 0.18, -s * 0.55, s * 0.72, s * 1.1, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.32, 2);
    ctx.lineTo(s * 0.72, 2);
    ctx.stroke();
    ctx.restore();
}
function drawGate(ctx: CanvasRenderingContext2D, g: Gate, highlight = false): void {
    const w = gateWall(g);
    const sw = gateSwitchPos(g);
    const ux = Math.cos(g.angle);
    const uy = Math.sin(g.angle);
    const t = g.slide;
    const stub = GATE.openStub;
    const ax = w.ax + (w.bx - w.ax) * t * (1 - stub);
    const ay = w.ay + (w.by - w.ay) * t * (1 - stub);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = highlight ? "#fff" : "#f0f0f0";
    ctx.lineWidth = highlight ? 2.6 : 2.2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(w.bx, w.by);
    ctx.stroke();
    const hx = w.bx;
    const hy = w.by;
    const nx = -uy;
    const ny = ux;
    ctx.lineWidth = highlight ? 1.8 : 1.4;
    ctx.beginPath();
    ctx.moveTo(hx - nx * 7, hy - ny * 7);
    ctx.lineTo(hx + nx * 7, hy + ny * 7);
    ctx.stroke();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = highlight ? "#fff" : "#9a9a9a";
    roundRectPath(ctx, sw.x - 8, sw.y - 8, 16, 16, 4);
    ctx.stroke();
    if (!g.open) {
        ctx.beginPath();
        ctx.moveTo(sw.x - 5, sw.y);
        ctx.lineTo(sw.x + 5, sw.y);
        ctx.stroke();
    }
    else {
        ctx.beginPath();
        ctx.moveTo(sw.x - 2, sw.y - 4);
        ctx.lineTo(sw.x - 2, sw.y + 4);
        ctx.stroke();
    }
    ctx.restore();
}
function drawGearLauncher(ctx: CanvasRenderingContext2D, world: World, tool: Tool): void {
    const t = GEAR_LAUNCH_TRAY;
    ctx.fillStyle = "#111";
    roundRectPath(ctx, t.x, t.y, t.w, t.h, 12);
    ctx.fill();
    const handle = toolboxHandleRect();
    roundRectPath(ctx, handle.x, handle.y, handle.w, handle.h, 10);
    ctx.fill();
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.lineWidth = 2;
    for (const dy of [-8, 0, 8]) {
        ctx.beginPath();
        ctx.moveTo(handle.x + 11, handle.y + handle.h / 2 + dy);
        ctx.lineTo(handle.x + handle.w - 11, handle.y + handle.h / 2 + dy);
        ctx.stroke();
    }
    ctx.strokeStyle = "#7a7a7a";
    ctx.lineWidth = 1.4;
    roundRectPath(ctx, t.x, t.y, t.w, t.h, 12);
    ctx.stroke();
    drawEraserIcon(ctx, ERASER_LAUNCH.x, ERASER_LAUNCH.y, ERASER_LAUNCH.r * 0.78);
    const b = BELT_LAUNCH;
    ctx.strokeStyle = tool === "belt" ? "#fff" : "#9a9a9a";
    ctx.lineWidth = tool === "belt" ? 2.2 : 1.4;
    roundRectPath(ctx, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 8);
    if (tool === "belt") {
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fill();
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x - 11, b.y - 5);
    ctx.lineTo(b.x + 11, b.y - 5);
    ctx.moveTo(b.x - 11, b.y + 5);
    ctx.lineTo(b.x + 11, b.y + 5);
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(b.x + i * 4.5, b.y - 5);
        ctx.lineTo(b.x + i * 4.5, b.y + 5);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(b.x - 11, b.y, 3.2, 0, Math.PI * 2);
    ctx.arc(b.x + 11, b.y, 3.2, 0, Math.PI * 2);
    ctx.stroke();
    const f = FREE_BELT_LAUNCH;
    ctx.strokeStyle = tool === "freeBelt" ? "#fff" : "#9a9a9a";
    ctx.lineWidth = tool === "freeBelt" ? 2.2 : 1.4;
    roundRectPath(ctx, f.x - f.w / 2, f.y - f.h / 2, f.w, f.h, 8);
    if (tool === "freeBelt") {
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fill();
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(f.x - 13, f.y + 5);
    ctx.lineTo(f.x - 5, f.y - 10);
    ctx.lineTo(f.x + 13, f.y - 3);
    ctx.lineTo(f.x + 7, f.y + 10);
    ctx.closePath();
    ctx.stroke();
    ctx.font = "14px sans-serif";
    ctx.fillStyle = MACHINE;
    ctx.textAlign = "center";
    for (const [i, c] of MOTOR_CONTROLS.entries()) {
        ctx.strokeRect(c.x, c.y, c.w, c.h);
        ctx.fillText(i === 0 ? (MOTOR_SETTINGS.direction > 0 ? "右回転 ↻" : "左回転 ↺") : `${MOTOR_SETTINGS.level} ${SPEED_LABELS[MOTOR_SETTINGS.level - 1]}`, c.x + c.w / 2, c.y + 27);
    }
    ctx.fillText("動力", GEAR_LAUNCH[0].x, GEAR_LAUNCH[0].y - GEAR_LAUNCH[0].r - 10);
    ctx.fillText("従動", FOLLOWER_LAUNCH[0].x, FOLLOWER_LAUNCH[0].y - FOLLOWER_LAUNCH[0].r - 10);
    ctx.textAlign = "start";
    for (const [items, powered] of [[GEAR_LAUNCH, true], [FOLLOWER_LAUNCH, false]] as const)
        for (const g of items) {
            drawGear(ctx, {
                id: -1,
                x: g.x,
                y: g.y,
                r: g.r,
                angle: powered ? world.time * placedGearDrive(g.r, MOTOR_SETTINGS.direction, MOTOR_SETTINGS.level) / g.r : 0,
                omega: 0,
                drive: 0,
                drivePriority: 0,
                driveSeq: 0,
                placed: true,
                spin: "gear",
            });
        }
    if (SHOW_BLOWER_LAUNCHER) {
        drawBlower(ctx, {
            x: BLOWER_LAUNCH.x,
            y: BLOWER_LAUNCH.y,
            angle: -Math.PI / 2,
            range: 80,
            mode: "planar",
            placed: true,
        }, world.time);
    }
    if (showGateLauncher(world.stage) && GATE_LAUNCH) {
        drawGateIcon(ctx, GATE_LAUNCH.x, GATE_LAUNCH.y, GATE_LAUNCH.r * 0.85);
    }
    if (showTruckStopLauncher(world.stage) && TRUCK_STOP_LAUNCH) {
        drawTruckStopIcon(ctx, TRUCK_STOP_LAUNCH.x, TRUCK_STOP_LAUNCH.y, TRUCK_STOP_LAUNCH.r * 0.78);
    }
}
function drawEraserDrag(ctx: CanvasRenderingContext2D, world: World, drag: EraserDrag): void {
    const hits = collectEraserHits(world, drag.x, drag.y, drag.r);
    drawFreeBelts(ctx, world, new Set(hits.filter(h => h.kind === "freeBelt").map(h => h.id)));
    const gearIds = new Set(hits.filter((h) => h.kind === "gear").map((h) => h.id));
    const strokeIds = new Set(hits.filter((h) => h.kind === "stroke").map((h) => h.id));
    const beltIds = new Set(hits.filter((h) => h.kind === "belt").map((h) => h.id));
    const blowerIds = new Set(hits.filter((h) => h.kind === "blower").map((h) => h.id));
    const gateIds = new Set(hits.filter((h) => h.kind === "gate").map((h) => h.id));
    const truckStopIds = new Set(hits.filter((h) => h.kind === "truckStop").map((h) => h.id));
    const armed = hits.length > 0;
    for (const s of world.segments) {
        if (!s.placed || s.belt || s.tag === "placedGate")
            continue;
        if (!strokeIds.has(s.stroke ?? -1))
            continue;
        drawSegment(ctx, s, world.time, true);
    }
    drawPlacedBelts(ctx, world, beltIds);
    for (const g of world.gears) {
        if (g.placed && g.spin === "gear" && gearIds.has(g.id))
            drawGear(ctx, g, true);
    }
    for (const b of world.blowers) {
        if (b.placed && blowerIds.has(b.id)) {
            ctx.save();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 26, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
    for (const g of world.gates) {
        if (gateIds.has(g.id))
            drawGate(ctx, g, true);
    }
    for (const s of world.recvTruckStops) {
        if (truckStopIds.has(s.id))
            drawRecvTruckAim(ctx, s.inletX, s.inletY, true);
    }
    ctx.save();
    ctx.strokeStyle = armed ? "#fff" : "#9a9a9a";
    ctx.lineWidth = armed ? 2.2 : 1.6;
    ctx.setLineDash(armed ? [] : [8, 6]);
    ctx.beginPath();
    ctx.arc(drag.x, drag.y, drag.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    drawEraserIcon(ctx, drag.x, drag.y, 14);
}
function drawBeltLadder(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, half: number, travel: number, highlight: boolean): void {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const a0x = ax + nx * half;
    const a0y = ay + ny * half;
    const a1x = ax - nx * half;
    const a1y = ay - ny * half;
    const b0x = bx + nx * half;
    const b0y = by + ny * half;
    const b1x = bx - nx * half;
    const b1y = by - ny * half;
    ctx.strokeStyle = highlight ? "#fff" : "#f0f0f0";
    ctx.lineWidth = highlight ? 2.4 : 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(a0x, a0y);
    ctx.lineTo(b0x, b0y);
    ctx.arc(bx, by, half, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
    ctx.lineTo(a1x, a1y);
    ctx.arc(ax, ay, half, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
    ctx.closePath();
    ctx.stroke();
    const step = 14;
    const phase = ((travel % step) + step) % step;
    ctx.lineWidth = highlight ? 2 : 1.5;
    for (let d = phase; d <= len; d += step) {
        const px = ax + ux * d;
        const py = ay + uy * d;
        strokeLine(ctx, px + nx * half, py + ny * half, px - nx * half, py - ny * half);
    }
}
function drawPlacedBelts(ctx: CanvasRenderingContext2D, world: World, highlightIds: Set<string> | null = null): void {
    for (const belt of world.belts) {
        if (!belt.id.startsWith("b"))
            continue;
        const rollers = world.gears.filter((g) => g.belt === belt.id && g.spin === "roller");
        if (rollers.length < 2)
            continue;
        const a = rollers[0];
        const b = rollers[1];
        const hi = !!highlightIds?.has(belt.id);
        const upperTravel = b.x >= a.x ? -belt.travel : belt.travel;
        drawBeltLadder(ctx, a.x, a.y, b.x, b.y, a.r, upperTravel, hi);
        for (const g of rollers) {
            ctx.strokeStyle = hi ? "#fff" : "#f0f0f0";
            ctx.lineWidth = hi ? 2.2 : 1.5;
            ctx.beginPath();
            ctx.arc(g.x, g.y, g.r * 0.78, 0, Math.PI * 2);
            ctx.stroke();
            ctx.save();
            ctx.translate(g.x, g.y);
            ctx.rotate(g.angle);
            ctx.beginPath();
            ctx.moveTo(-g.r * 0.5, 0);
            ctx.lineTo(g.r * 0.5, 0);
            ctx.stroke();
            ctx.restore();
        }
    }
}
function drawBeltDraft(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 8)
        return;
    const ok = len >= MIN_PLACED_BELT_LEN;
    ctx.globalAlpha = ok ? 0.9 : 0.45;
    drawBeltLadder(ctx, ax, ay, bx, by, PLACED_BELT_R, 0, false);
    ctx.globalAlpha = 1;
}
function strokePoly(ctx: CanvasRenderingContext2D, pts: {
    x: number;
    y: number;
}[]): void {
    if (pts.length < 2)
        return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++)
        ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
}
function drawFreeBeltBand(ctx: CanvasRenderingContext2D, points: {
    x: number;
    y: number;
}[], length: number, highlighted: boolean, phase = 0): void {
    if (points.length < 3 || length <= 0)
        return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const path = () => {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++)
            ctx.lineTo(points[i].x, points[i].y);
        ctx.closePath();
    };
    path();
    ctx.strokeStyle = highlighted ? "#fff" : "#c4c4c4";
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = highlighted ? "#454545" : "#252525";
    ctx.lineWidth = 7;
    ctx.stroke();
    const count = Math.max(3, Math.round(length / 12));
    const spacing = length / count;
    let target = ((phase % spacing) + spacing) % spacing;
    let start = 0;
    ctx.strokeStyle = highlighted ? "#fff" : "#b8b8b8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        const edge = Math.hypot(dx, dy);
        if (edge === 0)
            continue;
        while (target < start + edge && target < length) {
            const t = (target - start) / edge;
            const x = a.x + dx * t, y = a.y + dy * t;
            const nx = -dy / edge * 3.5, ny = dx / edge * 3.5;
            ctx.moveTo(x - nx, y - ny);
            ctx.lineTo(x + nx, y + ny);
            target += spacing;
        }
        start += edge;
    }
    ctx.stroke();
    ctx.restore();
}
function drawFreeBelts(ctx: CanvasRenderingContext2D, world: World, highlighted = new Set<number>()): void {
    for (const b of world.freeBelts ?? []) {
        drawFreeBeltBand(ctx, b.points, b.length, highlighted.has(b.id), b.travel ?? 0);
        for (const c of b.contacts ?? []) {
            const g = world.gears.find(g => g.id === c.gearId);
            if (!g)
                continue;
            drawBeltContact(ctx, g, c.point, c.normal, Math.max(0, 1 - (world.time - c.since) / 0.45));
        }
    }
}
function drawBeltContact(ctx: CanvasRenderingContext2D, gear: {
    x: number;
    y: number;
    r: number;
}, point: {
    x: number;
    y: number;
}, normal: {
    x: number;
    y: number;
}, pulse: number, preview = false, previewLabel = "接続位置"): void {
    ctx.save();
    const angle = Math.atan2(-normal.y, -normal.x);
    const press = Math.sin(pulse * Math.PI) * 1.5;
    ctx.strokeStyle = preview ? "#aaa" : "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gear.x, gear.y, gear.r + 1 + press, angle - 0.18, angle + 0.18);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, preview ? 5 : 3, 0, Math.PI * 2);
    ctx.stroke();
    if (preview || pulse > 0) {
        ctx.font = "12px system-ui";
        ctx.fillStyle = preview ? "#aaa" : "#fff";
        ctx.fillText(preview ? previewLabel : "接続", point.x + 9, point.y - 9);
    }
    ctx.restore();
}
function drawFree(ctx: CanvasRenderingContext2D): void {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.8;
    const h = FL.hopper;
    strokeLine(ctx, h.top.x0, h.top.y, h.top.x1, h.top.y);
    strokePoly(ctx, h.left);
    strokePoly(ctx, h.right);
    for (const r of FL.ramps)
        strokeLine(ctx, r.ax, r.ay, r.bx, r.by);
    const d = FL.dish;
    strokePoly(ctx, d.left);
    strokeLine(ctx, d.floor.x0, d.floor.y, d.floor.x1, d.floor.y);
    strokePoly(ctx, d.right);
}
export function drawWorld(ctx: CanvasRenderingContext2D, world: World, tool: Tool, draft: {
    x: number;
    y: number;
}[] | null, dragGear: GearDrag | null, dragEraser: EraserDrag | null, dragBlower: BlowerDrag | null = null, dragGate: GateDrag | null = null, dragTruckStop: TruckStopDrag | null = null): void {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (world.stage === "sewer")
        drawSewer(ctx, world);
    else if (world.stage === "free")
        drawFree(ctx);
    else if (world.stage === "sandbox")
        drawSandbox(ctx, world);
    else if (world.stage === "wash")
        drawWash(ctx, world);
    else {
    }
    drawRecvTruck(ctx, world);
    if (world.stage === "free" || world.stage === "sandbox") {
        for (const s of world.recvTruckStops) {
            if (dragTruckStop?.id === s.id)
                continue;
            drawRecvTruckAim(ctx, s.inletX, s.inletY);
        }
    }
    if (dragTruckStop)
        drawRecvTruckAim(ctx, dragTruckStop.x, dragTruckStop.y, true);
    if (DEBUG_PATHS) {
        for (const s of world.segments) {
            if (!s.placed)
                drawSegment(ctx, s, world.time);
        }
    }
    for (const s of world.segments) {
        if (s.placed && !s.belt && s.tag !== "placedGate")
            drawSegment(ctx, s, world.time);
    }
    drawPlacedBelts(ctx, world);
    drawFreeBelts(ctx, world);
    if (dragGear) {
        const roller = freeBeltSnap(world, dragGear, dragGear.r, 0.6);
        const friction = roller ? null : outerBeltSnap(world, dragGear);
        if (!gearPlacementAllowed(world, dragGear)) {
            ctx.save();
            ctx.strokeStyle = "#aaa";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(dragGear.x, dragGear.y, dragGear.r + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.font = "12px system-ui";
            ctx.fillStyle = "#aaa";
            ctx.fillText("ベルトと重なっています", dragGear.x + dragGear.r + 8, dragGear.y);
            ctx.restore();
        }
        else if (roller)
            drawBeltContact(ctx, dragGear, roller.point, roller.normal, 0.5, true, "ローラー接続位置");
        else if (friction)
            drawBeltContact(ctx, dragGear, friction.point, friction.normal, 0.5, true, friction.supported ? "外側摩擦接触位置" : "外側摩擦接触位置（内側ローラー2個必要）");
        else if (washGearMesh(world, dragGear)) {
            ctx.save();
            ctx.strokeStyle = "#aaa";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(dragGear.x, dragGear.y, dragGear.r + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.font = "12px system-ui";
            ctx.fillStyle = "#aaa";
            ctx.fillText("ギア接続", dragGear.x + dragGear.r + 8, dragGear.y);
            ctx.restore();
        }
    }
    if (draft && draft.length > 1) {
        if (tool === "belt") {
            const a = draft[0];
            const b = draft[draft.length - 1];
            drawBeltDraft(ctx, a.x, a.y, b.x, b.y);
        }
        else {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2.4;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(draft[0].x, draft[0].y);
            for (let i = 1; i < draft.length; i++)
                ctx.lineTo(draft[i].x, draft[i].y);
            ctx.stroke();
            if (tool === "freeBelt") {
                const start = draft[0], end = draft[draft.length - 1];
                const close = draft.length >= 4 && Math.hypot(start.x - end.x, start.y - end.y) <= FREE_BELT_CLOSE_R;
                ctx.strokeStyle = close ? "#8ee89a" : "#999";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(start.x, start.y, FREE_BELT_CLOSE_R, 0, Math.PI * 2);
                ctx.stroke();
                if (close) {
                    ctx.beginPath();
                    ctx.moveTo(end.x, end.y);
                    ctx.lineTo(start.x, start.y);
                    ctx.stroke();
                }
            }
        }
    }
    for (const g of world.gears) {
        if (g.spin !== "gear" || g.id === world.wash?.portId || g.id === world.wash?.sawId)
            continue;
        drawGear(ctx, g);
    }
    for (const g of world.gates)
        drawGate(ctx, g);
    for (const p of world.particles) {
    }
    for (const p of world.particles) {
    }
    for (const p of world.particles) {
        if (p.kind === "grain" || p.kind === "other")
            drawBall(ctx, p, world.stage);
    }
    if (world.stage === "wash")
        drawWashLaundry(ctx, world);
    drawHud(ctx, world, tool);
    drawGearLauncher(ctx, world, tool);
    if (dragGear) {
        ctx.globalAlpha = 0.92;
        drawGear(ctx, {
            id: -2,
            x: dragGear.x,
            y: dragGear.y,
            r: dragGear.r,
            angle: world.time * dragGear.drive / Math.max(10, dragGear.r),
            omega: 0,
            drive: 0,
            drivePriority: 0,
            driveSeq: 0,
            placed: true,
            spin: "gear",
        });
        ctx.globalAlpha = 1;
    }
    if (dragBlower) {
        ctx.globalAlpha = 0.9;
        drawBlower(ctx, {
            x: dragBlower.x,
            y: dragBlower.y,
            angle: -Math.PI / 2,
            range: 120,
            mode: "planar",
            placed: true,
        }, world.time);
        ctx.globalAlpha = 1;
    }
    if (dragGate) {
        ctx.globalAlpha = 0.92;
        drawGate(ctx, {
            id: -1,
            x: dragGate.x,
            y: dragGate.y,
            angle: dragGate.angle,
            open: false,
            solid: true,
            slide: 0,
        });
        ctx.globalAlpha = 1;
    }
    if (dragEraser)
        drawEraserDrag(ctx, world, dragEraser);
}
