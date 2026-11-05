// Use a CSS-pixel step on small stages and keep the visible count bounded as
// the stage grows. Weight width so shallow desktop stages stay airy too.
export function adaptiveRingSpacing(width, height, base = 6.7) {
  const extent = Math.max(height, width * .80);
  return base * Math.max(1, extent / 320);
}
