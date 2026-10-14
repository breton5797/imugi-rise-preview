// HSL triples ([h, s, l]) are the colour currency of the renderer.
const lerpH = (h1, h2, t) => (h1 + (((h2 - h1 + 540) % 360) - 180) * t + 360) % 360;

export const lerpC = (c, tgt, t) => [lerpH(c[0], tgt[0], t), c[1] + (tgt[1] - c[1]) * t, c[2] + (tgt[2] - c[2]) * t];

/** @param {number[]} c [h, s, l]  @param {number} a alpha  @param {number} dl lightness offset */
export const hsl = (c, a = 1, dl = 0) =>
  `hsla(${c[0].toFixed(1)},${c[1].toFixed(1)}%,${Math.max(0, Math.min(100, c[2] + dl)).toFixed(1)}%,${a})`;
