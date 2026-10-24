import type { StageId } from "./model";
export const BALL_COLORS = [
    "#ff5a6a",
    "#ff9f43",
    "#ffd93d",
    "#6bcb77",
    "#2ec4b6",
    "#4d96ff",
    "#9b59ff",
    "#ff6bcb",
] as const;
export function stageBallColor(stage: StageId, color: string): string {
    return color;
}
export function pickBallColor(id: number): string {
    return BALL_COLORS[(Math.abs(id) * 5) % BALL_COLORS.length];
}
export function drawBallTrack(ctx: CanvasRenderingContext2D, p: {
    x: number;
    y: number;
    r: number;
    trackId: string | null;
}): void {
    if (!p.trackId)
        return;
    void ctx;
}
