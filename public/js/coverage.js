// Use the same council polygons and projection as the detailed extract.
export function createCoverageCheck(councils, origin) {
  const polygons = councils.flatMap(council => {
    const geometry = council.geometry;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.map(rings => {
      const projected = rings.map(ring => ring.map(([lon, lat]) =>
        [(lon - origin[0]) * 69400, (origin[1] - lat) * 111320]));
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of projected[0]) {
        bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
        bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
      }
      return {rings: projected.map(ring => {
        const ys = ring.map(point => point[1]);
        const low = Math.min(...ys), high = Math.max(...ys);
        const step = Math.max(1, (high - low + 2) / 128);
        const buckets = Array.from({length: 130}, () => []);
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const edge = [ring[j], ring[i]];
          const first = Math.max(0, Math.floor((Math.min(edge[0][1], edge[1][1]) - 1 - low) / step));
          const last = Math.min(129, Math.floor((Math.max(edge[0][1], edge[1][1]) + 1 - low) / step));
          for (let k = first; k <= last; k++) buckets[k].push(edge);
        }
        return {low, step, buckets};
      }), bounds};
    });
  });
  function inRing([x, y], ring) {
    let inside = false;
    const bucket = Math.max(0, Math.min(129, Math.floor((y - ring.low) / ring.step)));
    for (const [[ax, ay], [bx, by]] of ring.buckets[bucket]) {
      const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
      // Feature coordinates are rounded; include points within one metre of an edge.
      if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= 1) return true;
      if ((ay > y) !== (by > y) && x < ax + (y - ay) * dx / dy) inside = !inside;
    }
    return inside;
  }
  return point => polygons.some(({rings, bounds: b}) =>
    point[0] >= b[0] - 1 && point[0] <= b[2] + 1 &&
    point[1] >= b[1] - 1 && point[1] <= b[3] + 1 &&
    inRing(point, rings[0]) && !rings.slice(1).some(ring => inRing(point, ring)));
}
