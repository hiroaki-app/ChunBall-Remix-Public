import type { World } from "./model";
import { WASH_BASKET, WASH_LAYOUT, WASH_SAW_PHASE, washDetergentMode, washPhaseLabel, washSpeckPosition, type WashLaundry } from "./wash";
const MACHINE = "#d6d6d6";
const DIM = "#8d8d8d";
const FAINT = "#5e5e5e";
function strokeLine(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}
function drawLid(ctx: CanvasRenderingContext2D, angle: number, latched: boolean): void {
    const h = WASH_LAYOUT.hinge;
    const len = WASH_LAYOUT.lidLength;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(angle);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.8;
    roundRect(ctx, 0, -14, len, 12, 2);
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(len * 0.62, -14);
    ctx.quadraticCurveTo(len * 0.72, -26, len * 0.82, -14);
    ctx.stroke();
    if (latched) {
        roundRect(ctx, len - 26, -11, 16, 8, 1);
        ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
    ctx.stroke();
}
function drawTub(ctx: CanvasRenderingContext2D, tubAngle: number, spinning: boolean): void {
    const tub = WASH_LAYOUT.tub;
    const rx = (tub.right - tub.left) / 2 - 14;
    const top = tub.top + 18;
    const bot = tub.bottom - 10;
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.7;
    ctx.strokeRect(tub.left, tub.top, tub.right - tub.left, tub.bottom - tub.top);
    ctx.strokeStyle = spinning ? "#fff" : DIM;
    ctx.lineWidth = spinning ? 1.5 : 1.15;
    ctx.beginPath();
    ctx.ellipse(tub.cx, top, rx, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(tub.cx, bot, rx, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    const ribs = 8;
    for (let i = 0; i < ribs; i++) {
        const a = tubAngle + (i / ribs) * Math.PI * 2;
        const x = tub.cx + Math.cos(a) * rx;
        const depth = (Math.sin(a) + 1) / 2;
        ctx.globalAlpha = spinning ? 0.45 + depth * 0.55 : 0.35 + depth * 0.3;
        ctx.lineWidth = spinning && depth > 0.65 ? 1.8 : 1.1;
        strokeLine(ctx, x, top, x, bot);
    }
    ctx.globalAlpha = 1;
    const beadA = tubAngle;
    ctx.strokeStyle = spinning ? "#fff" : MACHINE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(tub.cx + Math.cos(beadA) * rx, top + Math.sin(beadA) * 11, spinning ? 4.5 : 3, 0, Math.PI * 2);
    ctx.stroke();
}
function drawPulsator(ctx: CanvasRenderingContext2D, angle: number): void {
    const p = WASH_LAYOUT.pulsator;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, p.rx * 0.55, p.ry * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
        const a = angle + (i / 6) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(c * 14, s * 2.2);
        ctx.lineTo(c * p.rx * 0.88, s * p.ry * 0.85);
        ctx.stroke();
    }
    ctx.restore();
}
function drawGear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.35;
    const teeth = 8;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2;
        const a1 = a0 + Math.PI / teeth;
        const inner = r * 0.76;
        if (i === 0)
            ctx.moveTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
        else
            ctx.lineTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
        ctx.lineTo(Math.cos(a0 + 0.12) * r, Math.sin(a0 + 0.12) * r);
        ctx.lineTo(Math.cos(a1 - 0.12) * r, Math.sin(a1 - 0.12) * r);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
}
function drawRoom(ctx: CanvasRenderingContext2D, motorAngle: number, sawAngle: number): void {
    const tub = WASH_LAYOUT.tub;
    const room = WASH_LAYOUT.roomTop;
    const shaft = WASH_LAYOUT.shaft;
    const motor = WASH_LAYOUT.motor;
    const [drive, idler] = WASH_LAYOUT.gears;
    const cab = WASH_LAYOUT.cabinet;
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1.2;
    strokeLine(ctx, cab.x + 16, room, cab.x + cab.w - 16, room);
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.6;
    strokeLine(ctx, shaft.x, shaft.y0, shaft.x, shaft.y1);
    ctx.beginPath();
    ctx.arc(shaft.x, shaft.y1, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(shaft.x + 8, shaft.y1 - 6);
    ctx.lineTo(motor.x - motor.r, motor.y - 10);
    ctx.moveTo(shaft.x + 6, shaft.y1 + 8);
    ctx.lineTo(motor.x - motor.r, motor.y + 10);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(motor.x, motor.y, motor.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(motor.x, motor.y);
    ctx.rotate(motorAngle);
    ctx.lineWidth = 1.3;
    strokeLine(ctx, -motor.r + 5, 0, motor.r - 5, 0);
    strokeLine(ctx, 0, -motor.r + 5, 0, motor.r - 5);
    ctx.restore();
    drawGear(ctx, drive.x, drive.y, drive.r, motorAngle);
    drawGear(ctx, idler.x, idler.y, idler.r, sawAngle);
    const drain = WASH_LAYOUT.drain;
    const exit = WASH_LAYOUT.exit;
    const lipY = tub.bottom - exit.lip;
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.2;
    strokeLine(ctx, drain.x0, tub.bottom + 8, drain.x0 - 10, cab.y + cab.h - 10);
    strokeLine(ctx, drain.x1, tub.bottom + 8, drain.x1 + 10, cab.y + cab.h - 10);
    strokeLine(ctx, tub.left - 4, lipY + 6, tub.left - 22, cab.y + cab.h - 8);
    strokeLine(ctx, tub.left + exit.mouth + 4, tub.bottom + 8, tub.left + exit.mouth - 8, cab.y + cab.h - 8);
    strokeLine(ctx, tub.right + 4, lipY + 6, tub.right + 22, cab.y + cab.h - 8);
    strokeLine(ctx, tub.right - exit.mouth - 4, tub.bottom + 8, tub.right - exit.mouth + 8, cab.y + cab.h - 8);
}
function drawBasket(ctx: CanvasRenderingContext2D): void {
    const b = WASH_BASKET;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(b.cx, b.mouthY, b.mouthRx, b.mouthRy, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.leftRim.x, b.leftRim.y);
    ctx.quadraticCurveTo(b.leftCtrl.x, b.leftCtrl.y, b.bottomL.x, b.bottomL.y);
    ctx.quadraticCurveTo(b.cx, b.bottomY + 4, b.bottomR.x, b.bottomR.y);
    ctx.quadraticCurveTo(b.rightCtrl.x, b.rightCtrl.y, b.rightRim.x, b.rightRim.y);
    ctx.stroke();
}
function drawDetergentButton(ctx: CanvasRenderingContext2D, mode: "ready" | "busy" | "full"): void {
    const box = WASH_LAYOUT.drop;
    const busy = mode === "busy";
    const full = mode === "full";
    ctx.strokeStyle = busy ? "#fff" : full ? "#6e6e6e" : DIM;
    ctx.lineWidth = busy ? 2 : 1.4;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    if (busy) {
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fill();
    }
    ctx.stroke();
    const ix = box.x + 28;
    const iy = box.y + box.h / 2 + 6;
    ctx.strokeStyle = busy ? "#fff" : full ? "#8a8a8a" : "#cfcfcf";
    ctx.lineWidth = 1.4;
    roundRect(ctx, ix - 7, iy - 16, 14, 16, 3);
    ctx.stroke();
    ctx.strokeRect(ix - 3, iy - 22, 6, 6);
    ctx.beginPath();
    ctx.arc(ix, iy + 4, 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "15px sans-serif";
    ctx.fillStyle = busy ? "#fff" : full ? "#8a8a8a" : "#cfcfcf";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(full ? "満杯" : "洗剤", box.x + box.w / 2 + 12, box.y + box.h / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
}
function drawSwitch(ctx: CanvasRenderingContext2D, box: {
    x: number;
    y: number;
    w: number;
    h: number;
}, label: string, on: boolean): void {
    ctx.strokeStyle = on ? "#fff" : DIM;
    ctx.lineWidth = on ? 2 : 1.4;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    if (on) {
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fill();
    }
    ctx.stroke();
    ctx.font = "15px sans-serif";
    ctx.fillStyle = on ? "#fff" : "#cfcfcf";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, box.x + box.w / 2, box.y + box.h / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
}
function drawShirt(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(-40, -6);
    ctx.lineTo(-40, -20);
    ctx.lineTo(-16, -16);
    ctx.quadraticCurveTo(0, 4, 16, -16);
    ctx.lineTo(40, -20);
    ctx.lineTo(40, -6);
    ctx.lineTo(18, -2);
    ctx.lineTo(18, 24);
    ctx.lineTo(-18, 24);
    ctx.lineTo(-18, -2);
    ctx.closePath();
    ctx.stroke();
}
function drawSock(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(-7, -32);
    ctx.lineTo(-7, 4);
    ctx.quadraticCurveTo(-18, 8, -16, 18);
    ctx.lineTo(18, 20);
    ctx.quadraticCurveTo(36, 18, 36, 8);
    ctx.quadraticCurveTo(34, -2, 16, -2);
    ctx.lineTo(7, -2);
    ctx.lineTo(7, -32);
    ctx.closePath();
    ctx.stroke();
    strokeLine(ctx, -7, -22, 7, -22);
}
function drawTowel(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(-36, -8);
    ctx.quadraticCurveTo(-34, -16, -24, -15);
    ctx.lineTo(6, -17);
    ctx.quadraticCurveTo(18, -21, 28, -15);
    ctx.lineTo(36, -14);
    ctx.quadraticCurveTo(44, -12, 42, -4);
    ctx.lineTo(38, 4);
    ctx.quadraticCurveTo(36, 10, 26, 10);
    ctx.lineTo(-20, 8);
    ctx.quadraticCurveTo(-34, 8, -40, 2);
    ctx.lineTo(-40, -4);
    ctx.quadraticCurveTo(-40, -10, -36, -8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-38, 8);
    ctx.lineTo(26, 10);
    ctx.quadraticCurveTo(40, 10, 42, 4);
    ctx.lineTo(40, 12);
    ctx.quadraticCurveTo(36, 20, 24, 20);
    ctx.lineTo(-22, 16);
    ctx.quadraticCurveTo(-40, 14, -44, 6);
    ctx.lineTo(-40, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-30, -1);
    ctx.lineTo(34, -3);
    ctx.stroke();
}
function drawGarment(ctx: CanvasRenderingContext2D, item: WashLaundry): void {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.angle);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.8;
    if (item.kind === "shirt")
        drawShirt(ctx);
    else if (item.kind === "sock")
        drawSock(ctx);
    else
        drawTowel(ctx);
    ctx.restore();
}
export function drawWashLaundry(ctx: CanvasRenderingContext2D, world: World): void {
    const state = world.wash;
    if (!state)
        return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const item of state.laundry)
        drawGarment(ctx, item);
    for (const item of state.laundry) {
        for (const dirt of item.dirt) {
            const at = washSpeckPosition(item, dirt);
            ctx.fillStyle = dirt.color;
            ctx.beginPath();
            ctx.arc(at.x, at.y, 3.1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}
export function drawWash(ctx: CanvasRenderingContext2D, world: World): void {
    const state = world.wash;
    if (!state)
        return;
    const cab = WASH_LAYOUT.cabinet;
    const tub = WASH_LAYOUT.tub;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.8;
    roundRect(ctx, cab.x, cab.y, cab.w, cab.h, 6);
    ctx.stroke();
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1.2;
    strokeLine(ctx, tub.right + 28, cab.y + 18, tub.right + 28, WASH_LAYOUT.roomTop);
    const gapL = tub.cx - 40;
    const gapR = tub.cx + 40;
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(tub.cx - 18, tub.top - 38, 36, 20);
    strokeLine(ctx, tub.cx - 12, tub.top - 18, gapL + 6, tub.top + 6);
    strokeLine(ctx, tub.cx + 12, tub.top - 18, gapR - 6, tub.top + 6);
    drawTub(ctx, state.tubAngle, state.phase === "spin" && Math.abs(state.tubOmega) > 0.8);
    drawPulsator(ctx, state.pulsatorAngle);
    const port = world.gears.find((g) => g.id === state.portId);
    const saw = world.gears.find((g) => g.id === state.sawId);
    const shaft = port?.motorKind === "motor" ? port.angle : state.motorAngle;
    const ratio = WASH_LAYOUT.gears[0].r / WASH_LAYOUT.gears[1].r;
    const sawAngle = state.sawJoined && saw ? saw.angle : -shaft * ratio + WASH_SAW_PHASE;
    drawRoom(ctx, shaft, sawAngle);
    if (state.basketHold > 0)
        drawBasket(ctx);
    const latched = state.lid !== "open" && (state.phase === "spin" || Math.abs(state.tubOmega) > 0.4);
    drawLid(ctx, state.lidAngle, latched);
    const status = WASH_LAYOUT.status;
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(status.x, status.y);
    ctx.lineTo(status.x, status.y + status.h);
    ctx.stroke();
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#8d8d8d";
    ctx.textAlign = "center";
    ctx.fillText("工程", status.x + status.w / 2, status.y + 16);
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(washPhaseLabel(state), status.x + status.w / 2, status.y + 40);
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#8d8d8d";
    ctx.fillText("操作", WASH_LAYOUT.power.x + WASH_LAYOUT.power.w / 2, WASH_LAYOUT.power.y - 8);
    const powered = state.power && !state.finished;
    drawSwitch(ctx, WASH_LAYOUT.power, powered ? "電源 ON" : "電源 OFF", powered);
    drawDetergentButton(ctx, washDetergentMode(world));
    ctx.textAlign = "start";
    ctx.restore();
}
