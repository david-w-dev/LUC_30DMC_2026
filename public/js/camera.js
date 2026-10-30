export function fitOverview(bounds, origin, width, height) {
  const [west, south, east, north] = bounds;
  const x0 = (west - origin[0]) * 69400;
  const x1 = (east - origin[0]) * 69400;
  const y0 = (origin[1] - north) * 111320;
  const y1 = (origin[1] - south) * 111320;
  const scale = Math.min(Math.max(1, width - 64) / (x1 - x0),
    Math.max(1, height - 210) / (y1 - y0));
  return { scale, baseScale: scale,
    offsetX: -(x0 + x1) * scale / 2,
    offsetY: -(y0 + y1) * scale / 2 - 38 };
}

export const zoomScale = (state, level) =>
  (state.baseScale || 0.016) * Math.pow(100, (level - 1) / 9);

export const zoomLevel = (state) => Math.max(1, Math.min(10,
  1 + 9 * Math.log(state.scale / (state.baseScale || 0.016)) / Math.log(100)));

export function createCamera(state, draw) {
  let motionId = 0;
  function animateTo(x, y, z) {
    cancelAnimationFrame(motionId);
    const startX = state.offsetX,
      startY = state.offsetY,
      startZ = state.scale,
      start = performance.now();
    const duration = 1800;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t * t * (3 - 2 * t);
      state.scale = startZ * Math.pow(z / startZ, eased);
      const zoomFraction =
        z === startZ ? eased : (state.scale - startZ) / (z - startZ);
      state.offsetX = startX + (x - startX) * zoomFraction;
      state.offsetY = startY + (y - startY) * zoomFraction;
      draw();
      if (t < 1) motionId = requestAnimationFrame(tick);
    };
    motionId = requestAnimationFrame(tick);
  }

  return { animateTo, cancel: () => cancelAnimationFrame(motionId) };
}
