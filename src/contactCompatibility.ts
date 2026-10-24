// Preserve the original cross-stage particle response without machine geometry.
// Evaluate after overlap correction, as in the original collision calculation.
export function compatibleRestitution(
    a: { x: number; y: number },
    b: { x: number; y: number },
    normal: number,
): number {
    const inside = (p: { x: number; y: number }) =>
        p.x >= 780 && p.x <= 1080 && p.y >= 96 && p.y <= 526;
    return inside(a) && inside(b) ? 0.04 : normal;
}
