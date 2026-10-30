import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDataset} from './data.js';
import {createCoverageCheck} from '../public/js/coverage.js';

test('actual council boundaries retain covered towns and exclude surrounding destinations', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/data/detail-manifest.json', import.meta.url)));
  const map = readDataset('cardiff-map'), regional = readDataset('regional-map');
  const contains = createCoverageCheck(manifest.councils, map.origin);
  const places = [...map.targets, ...regional.targets].filter(t => t[0] === 'p');
  for (const name of ['Cardiff', 'Barry', 'Penarth', 'Cowbridge', 'Llantwit Major', 'Rhoose']) {
    const point = places.find(t => t[1] === name);
    assert.ok(point, name);
    assert.equal(contains([point[3], point[4]]), true, name);
  }
  for (const name of ['Bridgend', 'Pontypridd', 'Caerphilly']) {
    const point = places.find(t => t[1] === name);
    assert.ok(point, name);
    assert.equal(contains([point[3], point[4]]), false, name);
  }
});

test('coverage respects holes and separate polygons', () => {
  const ring = (a,b,c,d) => [[a,b],[c,b],[c,d],[a,d],[a,b]];
  const contains = createCoverageCheck([{geometry: {type: 'MultiPolygon', coordinates:
    [[ring(0,0,1,1), ring(.3,.3,.7,.7)], [ring(2,2,3,3)]]}}], [0,0]);
  const point = (x,y) => [x*69400,-y*111320];
  assert.equal(contains(point(.1,.1)), true);
  assert.equal(contains(point(.5,.5)), false);
  assert.equal(contains(point(2.5,2.5)), true);
  assert.equal(contains(point(1.5,1.5)), false);
});
