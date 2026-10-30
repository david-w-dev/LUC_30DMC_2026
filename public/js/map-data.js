export async function loadDataset(path) {
  const url = new URL(path, import.meta.url);
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Map data failed to load (${response.status})`);
  const manifest = await response.json();
  const parts = await Promise.all(manifest.chunks.map(async name => {
    const chunk = await fetch(new URL(name, url));
    if (!chunk.ok) throw new Error(`Map chunk failed to load (${chunk.status})`);
    return chunk.text();
  }));
  const bytes = Uint8Array.from(atob(parts.join('')), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

export async function loadMapData() {
  const [mapData, regionalData, poiData, detailManifest] = await Promise.all([
    loadDataset("../data/cardiff-map.json?v=20261030-full"),
    loadDataset("../data/regional-map.json?v=20261030-full"),
    fetch(new URL("../data/pois.json?v=20261030-full", import.meta.url)).then(response => {
      if (!response.ok) throw new Error("POI data failed to load");
      return response.json();
    }),
    fetch(new URL('../data/detail-manifest.json?v=20261030-full', import.meta.url)).then(response=>{
      if (!response.ok) throw new Error('Map coverage manifest failed to load');
      return response.json();
    }),
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
