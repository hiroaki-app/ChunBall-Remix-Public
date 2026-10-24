import type { World } from "./model";
import { SANDBOX_BASKET } from "./sandbox";
const MACHINE = "#d6d6d6";
export function drawSandbox(ctx: CanvasRenderingContext2D, world: World): void {
    if (world.sandbox?.released)
        return;
    const b = SANDBOX_BASKET;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = MACHINE;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(b.cx, b.mouthY, b.mouthRx, b.mouthRy, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.leftRim.x, b.leftRim.y);
    ctx.quadraticCurveTo(b.leftCtrl.x, b.leftCtrl.y, b.bottomL.x, b.bottomL.y);
    ctx.quadraticCurveTo(b.cx, b.bottomY + 6, b.bottomR.x, b.bottomR.y);
    ctx.quadraticCurveTo(b.rightCtrl.x, b.rightCtrl.y, b.rightRim.x, b.rightRim.y);
    ctx.stroke();
    ctx.restore();
}
