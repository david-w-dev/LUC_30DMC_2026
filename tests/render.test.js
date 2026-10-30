import test from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../public/js/renderer.js";

test("overview omits minor roads and reveals them at closer zooms", () => {
  function roadStarts(level) {
    const starts = [];
    const ctx = new Proxy({
      measureText: value => ({width: value.length * 6.6}),
      moveTo(x, y) { starts.push([x, y]); },
    }, {get: (obj, key) => key in obj ? obj[key] : () => {}});
    const state = {baseScale: 0.016, scale: 0.016 * 100 ** ((level - 1) / 9),
      offsetX: 0, offsetY: 0, suggestions: [], commandText: '', responseText: '', selectedIndex: -1};
    createRenderer({canvas: {getContext: () => ctx}, screen: {clientWidth: 980, clientHeight: 480},
      state, mapData: {roads: [], buildings: [], water: [], green: [], luc: [], targets: []},
      regionalData: {labels: [], water: [], green: [], roads: [
        ['primary', [[101, 101], [102, 102]]],
        ['tertiary', [[201, 201], [202, 202]]],
        ['residential', [[301, 301], [302, 302]]],
      ]}}).draw();
    return starts.map(([x]) => x);
  }
  assert.ok(roadStarts(1).includes(101));
  assert.ok(!roadStarts(1).includes(201));
  assert.ok(roadStarts(3).includes(201));
  assert.ok(!roadStarts(3).includes(301));
  assert.ok(roadStarts(5).includes(301));
});
