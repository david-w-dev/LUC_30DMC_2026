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
