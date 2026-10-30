export const radarCategories = {
  cafe: 'cafes', cafes: 'cafes', coffee: 'cafes',
  pub: 'pubs', pubs: 'pubs', restaurant: 'restaurants', restaurants: 'restaurants',
  park: 'parks', parks: 'parks',
};

export function radarCandidates(pois, category, state, width, height) {
  const centre = [-state.offsetX / state.scale, -state.offsetY / state.scale];
  return pois.filter(poi => poi.category === category).map(poi => ({
    ...poi, distance: Math.hypot(poi.point[0] - centre[0], poi.point[1] - centre[1]),
  })).filter(poi => {
    const x = width / 2 + state.offsetX + poi.point[0] * state.scale;
    const y = height / 2 + state.offsetY + poi.point[1] * state.scale;
    return x > 12 && x < width - 12 && y > 30 && y < height - 190;
  }).sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));
}

export function createRadar({state, screen, pois, draw}) {
  let frame = 0;
  function cancel(clear = true) {
    cancelAnimationFrame(frame);
    if (state.radar) state.radar.scanning = false;
    if (clear) state.radar = null;
  }
  function showPage() {
    const scan = state.radar;
    if (!scan) return;
    const pages = Math.max(1, Math.ceil(scan.revealed.length / 4));
    scan.page = Math.max(0, Math.min(pages - 1, scan.page));
    state.suggestions = scan.revealed.slice(scan.page * 4, scan.page * 4 + 4);
    state.selectedIndex = state.suggestions.length ? Math.max(0, Math.min(state.selectedIndex, state.suggestions.length - 1)) : -1;
    state.responseText = `${scan.scanning ? 'SCANNING' : 'DETECTED'}: ${scan.revealed.length} ${scan.category.toUpperCase()} IN VIEW (MAPPED OSM)` +
      (pages > 1 ? ` - PAGE ${scan.page + 1}/${pages} - RADAR NEXT / PREV` : '') +
      (!scan.scanning && !scan.revealed.length ? ' - TRY ZOOMING OUT OR MOVING' : '');
  }
  function start(query = 'cafes') {
    const command = query.trim().toLowerCase();
    if (['off', 'clear'].includes(command)) {
      cancel(); state.suggestions = []; state.selectedIndex = -1;
      state.responseText = 'RADAR CLEARED'; draw(); return;
    }
    if (['next', 'prev'].includes(command)) {
      if (state.radar) { state.radar.page += command === 'next' ? 1 : -1; showPage(); }
      else state.responseText = 'START A SCAN WITH RADAR CAFES';
      draw(); return;
    }
    const category = radarCategories[command || 'cafes'];
    if (!category) { cancel(false); state.responseText = 'RADAR CAFES / PUBS / RESTAURANTS / PARKS'; draw(); return; }
    cancel();
    const candidates = radarCandidates(pois, category, state, screen.clientWidth, screen.clientHeight);
    const scan = state.radar = {category, centre: [-state.offsetX / state.scale, -state.offsetY / state.scale],
      candidates, revealed: [], page: 0, radius: 0, scanning: true, started: performance.now()};
    const maxRadius = Math.hypot(screen.clientWidth / 2, screen.clientHeight / 2) / state.scale;
    state.suggestions = []; state.selectedIndex = -1;
    const tick = now => {
      if (state.radar !== scan) return;
      const progress = Math.min(1, (now - scan.started) / 3600);
      scan.radius = maxRadius * progress;
      scan.scanning = progress < 1;
      while (scan.revealed.length < candidates.length && candidates[scan.revealed.length].distance <= scan.radius) {
        scan.revealed.push({...candidates[scan.revealed.length], revealedAt: now});
      }
      // Animated pulses and changing result panels must not accumulate in CRT history.
      state.display?.clearHistory();
      showPage(); draw();
      if (scan.scanning) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  return {start, cancel};
}
