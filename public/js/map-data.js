const networkQueue = [];
let activeRequests = 0;
const MAX_REQUESTS = 6;

function limitedRequest(task) {
  return new Promise((resolve, reject) => {
    networkQueue.push({task, resolve, reject});
    drainRequests();
  });
}
function drainRequests() {
  while (activeRequests < MAX_REQUESTS && networkQueue.length) {
    const request = networkQueue.shift();
    activeRequests++;
    Promise.resolve().then(request.task).then(request.resolve, request.reject).finally(() => {
      activeRequests--;
      drainRequests();
    });
  }
}

export async function readMapResource(url, type = 'json') {
  for (let attempt = 0; ; attempt++) {
    try {
      return await limitedRequest(async () => {
        const response = await fetch(url);
        if (!response.ok) {
          const error = new Error(`Map download failed (${response.status})`);
          error.retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
          const after = response.headers.get('Retry-After');
          const seconds = after && Number(after);
          const date = after && Date.parse(after);
          error.retryAfter = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000
            : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
          throw error;
        }
        return type === 'text' ? response.text() : response.json();
      });
    } catch (error) {
      if (attempt >= 3 || !(error.retryable || error instanceof TypeError)) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.max(error.retryAfter || 0, 300 * 2 ** attempt)));
    }
  }
}

export async function loadDataset(path) {
  const url = new URL(path, import.meta.url);
  const manifest = await readMapResource(url);
  const parts = await Promise.all(manifest.chunks.map(name => readMapResource(new URL(name, url), 'text')));
  const bytes = Uint8Array.from(atob(parts.join('')), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

export async function loadMapData() {
  const [mapData, regionalData, poiData, detailManifest] = await Promise.all([
    loadDataset("../data/cardiff-map.json?v=20261030-download-fix"),
    loadDataset("../data/regional-map.json?v=20261030-download-fix"),
    readMapResource(new URL("../data/pois.json?v=20261030-download-fix", import.meta.url)),
    readMapResource(new URL("../data/detail-manifest.json?v=20261030-download-fix", import.meta.url)),
  ]);
  mapData.pois = poiData.pois;
  mapData.roads = mapData.roads.map(([roadClass, points]) => ({
    class: roadClass,
    points,
  }));
  const categories = { p: "place", s: "street", l: "landmark", a: "address" };
  mapData.targets = [...mapData.targets, ...regionalData.targets].map(
    ([category, name, id, x, y, cy]) => ({
      category: categories[category],
      name,
      id,
      point: [x, y],
      cy,
    }),
  );
  return { mapData, regionalData, detailManifest };
}
