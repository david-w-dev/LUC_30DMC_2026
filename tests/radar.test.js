import test from 'node:test';
import assert from 'node:assert/strict';
import {createRadar, radarCandidates} from '../public/js/radar.js';
import {mapSnapshot} from '../public/js/export-map.js';

const stateFor = () => ({scale: 1, offsetX: 0, offsetY: 0, suggestions: [], selectedIndex: -1});
const poi = (name, x, y = 0, category = 'cafes') => ({id: name, name, category, point: [x,y]});

test('radar filters category and viewport, then orders by distance from centre', () => {
  const matches = radarCandidates([poi('far',100),poi('near',10),poi('offscreen',700),poi('hidden by terminal',0,220),poi('pub',0,0,'pubs')], 'cafes', stateFor(), 1000, 700);
  assert.deepEqual(matches.map(p => p.name), ['near','far']);
});

test('pulse reveals only reached POIs, paginates all results and cancels safely', () => {
  const previousRequest = globalThis.requestAnimationFrame, previousCancel = globalThis.cancelAnimationFrame;
  let callback;
  globalThis.requestAnimationFrame = f => {callback = f; return 1;};
  globalThis.cancelAnimationFrame = () => {};
  try {
    const state = stateFor();
    const radar = createRadar({state,screen:{clientWidth:1000,clientHeight:700},
      pois: Array.from({length:6},(_,i)=>poi(`Cafe ${i}`,50+i*50)),draw(){}});
    radar.start('cafes');
    const start = state.radar.started;
    callback(start + 100);
    assert.equal(state.radar.revealed.length,0);
    callback(start + 500);
    assert.equal(state.radar.revealed.length,1);
    callback(start + 3600);
    assert.equal(state.radar.revealed.length,6);
    assert.equal(state.radar.scanning,false);
    assert.equal(state.suggestions.length,4);
    radar.start('next');
    assert.equal(state.suggestions.length,2);
    assert.equal(state.suggestions[0].name,'Cafe 4');
    radar.start('prev');
    assert.equal(state.suggestions[0].name,'Cafe 0');
    radar.start('off');
    assert.equal(state.radar,null);
    assert.equal(state.suggestions.length,0);
  } finally {globalThis.requestAnimationFrame=previousRequest;globalThis.cancelAnimationFrame=previousCancel;}
});

test('PNG snapshot uses the composited CRT frame when available', async () => {
  const image = {width:1000,height:700};
  assert.equal(await mapSnapshot({}, {capture:async()=>image}),image);
});

test('PNG snapshot falls back to copying the map when WebGL is unavailable', async () => {
  const previous = globalThis.document;
  let copied;
  const snapshot={getContext:()=>({drawImage:source=>{copied=source;}})};
  globalThis.document={createElement:()=>snapshot};
  try {
    const source={width:1000,height:700};
    assert.equal(await mapSnapshot(source,null),snapshot);
    assert.equal(copied,source);
    assert.equal(snapshot.width,1000);
    assert.equal(snapshot.height,700);
  } finally {globalThis.document=previous;}
});

test('imported POIs provide real categories and valid coordinates', async () => {
  const {readFileSync} = await import('node:fs');
  const data = JSON.parse(readFileSync(new URL('../public/data/pois.json', import.meta.url)));
  assert.match(data.scope,/Cardiff.*Vale/);
  assert.equal(new Set(data.pois.map(p=>p.id)).size,data.pois.length);
  for(const category of ['cafes','pubs','restaurants','parks']) {
    assert.ok(data.pois.filter(p=>p.category===category).length>10);
  }
  for(const p of data.pois) {
    assert.ok(p.name && p.point.length===2 && p.point.every(Number.isFinite));
  }
});
