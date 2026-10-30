import { zoomLevel } from './camera.js?v=20261030-mobile';
import { loadDataset } from './map-data.js?v=20261030-mobile';

export function visibleSections(sections, state, width, height) {
  const rect = [(-width/2-state.offsetX)/state.scale - 200,
    (-height/2-state.offsetY)/state.scale - 200,
    (width/2-state.offsetX)/state.scale + 200,
    (height/2-state.offsetY)/state.scale + 200];
  return sections.filter(({bounds:b}) => b[2]>=rect[0] && b[0]<=rect[2] && b[3]>=rect[1] && b[1]<=rect[3])
    .sort((a,b) => {
      const distance = t => Math.hypot((t.bounds[0]+t.bounds[2])/2 + state.offsetX/state.scale,
        (t.bounds[1]+t.bounds[3])/2 + state.offsetY/state.scale);
      return distance(a)-distance(b);
    });
}

export function createDetailLoader({mapData, manifest, redraw, load = loadDataset, concurrency = 4, cacheLimit = 16}) {
  const cache = new Map(), pending = new Set(), failures = new Set();
  let wanted = [], signature = '', active = 0, shown = null;
  function publish() {
    const ready = wanted.every(t => cache.has(t.key));
    const next = wanted.filter(t => cache.has(t.key));
    const key = next.map(t=>t.key).sort().join(',');
    if (shown !== key) {
      shown = key;
      mapData.detailTiles = next.map(t=>cache.get(t.key));
      mapData.detailRevision = (mapData.detailRevision || 0) + 1;
    }
    mapData.detailReady = ready && wanted.length > 0;
    mapData.detailLoading = wanted.some(t=>!cache.has(t.key) && !failures.has(t.key));
    mapData.detailError = wanted.some(t=>failures.has(t.key));
    const protectedKeys = new Set(wanted.map(t=>t.key));
    for (const key of cache.keys()) {
      if (cache.size <= cacheLimit) break;
      if (!protectedKeys.has(key)) cache.delete(key);
    }
    redraw();
  }
  function pump() {
    for (const tile of wanted) {
      if (active >= concurrency) break;
      if (cache.has(tile.key) || pending.has(tile.key) || failures.has(tile.key)) continue;
      active++; pending.add(tile.key);
      Promise.resolve().then(()=>load('../data/' + tile.path)).then(data=>{
        cache.set(tile.key,data);
      }).catch(error=>{
        console.error('Map section failed', tile.key, error);
        failures.add(tile.key);
      }).finally(()=>{
        pending.delete(tile.key); active--;
        publish(); pump();
      });
    }
  }
  return {
    update(state, width, height) {
      const next = zoomLevel(state)>=3 ? visibleSections(manifest.tiles,state,width,height) : [];
      const key = next.map(t=>t.key).sort().join(',');
      if (key === signature) return;
      signature = key; wanted = next;
      for (const tile of next) if(cache.has(tile.key)) {
        const value = cache.get(tile.key); cache.delete(tile.key); cache.set(tile.key,value);
      }
      publish(); pump();
    },
  };
}
