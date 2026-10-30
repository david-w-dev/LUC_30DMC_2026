import test from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../public/js/renderer.js";

function fixture(scale = 0.016) {
  const text = [],
    fills = [];
  const ctx = new Proxy(
    {
      measureText: (value) => ({ width: value.length * 6.6 }),
      fillText(value, x, y) {
        text.push({ value, x, y });
      },
      fill() {
        fills.push(this.fillStyle);
      },
    },
    { get: (obj, key) => (key in obj ? obj[key] : () => {}) },
  );
  const state = {
    scale,
    offsetX: 0,
    offsetY: 0,
    display: null,
    commandText: "",
    responseText: "READY",
    suggestions: [],
    selectedIndex: -1,
    activeLabel: "Brunel House",
  };
  const targets = Array.from({ length: 40 }, (_, i) => ({
    name: i ? `Place ${i}` : "Brunel House",
    category: "place",
    id: `node/${i}`,
    point: [i * 40, i * 20],
    cy: "",
  }));
  const mapData = {
    roads: [],
    buildings: [],
    water: [],
    green: [],
    targets,
    luc: [
      [-8, -8],
      [8, -8],
      [8, 8],
      [-8, 8],
      [-8, -8],
    ],
  };
  const regionalData = {
    roads: [],
    water: [],
    green: [],
    labels: targets.map((t) => t.name),
  };
  const renderer = createRenderer({
    canvas: { width: 980, height: 480, getContext: () => ctx },
    screen: { clientWidth: 980, clientHeight: 480 },
    mapData,
    regionalData,
    state,
  });
  return { renderer, text, fills, state, targets };
}

test("crowded names do not overlap and selected destination wins", () => {
  const f = fixture();
  f.renderer.draw();
  const labels = f.text.filter(
    (t) => t.value === "BRUNEL HOUSE" || t.value.startsWith("PLACE "),
  );
  assert.equal(labels[0].value, "BRUNEL HOUSE");
  assert.ok(labels.length <= 8);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i],
        b = labels[j];
      assert.ok(
        Math.abs(a.y - b.y) >= 28 ||
          Math.abs(a.x - b.x) >= (a.value.length + b.value.length) * 3.3 + 20,
      );
    }
  }
});

test("Brunel House fills gold at building zoom, with on-screen attribution", () => {
  const f = fixture(0.5);
  f.renderer.draw();
  assert.ok(f.fills.includes("#f2c552"));
  assert.ok(f.text.some((t) => t.value === "LUC"));
  assert.ok(f.text.some((t) => t.value.includes("OPENSTREETMAP CONTRIBUTORS")));
  assert.ok(!f.text.some((t) => t.value.includes("1966 STUDY")));
});


test("regional places outside the old shortlist appear across the viewport", () => {
  const f = fixture(0.05);
  f.targets.push(
    {name: "Western Village", category: "place", id: "place/west", point: [-6000, -1500]},
    {name: "Eastern Village", category: "place", id: "place/east", point: [6000, -1500]},
  );
  f.renderer.draw();
  assert.ok(f.text.some(t => t.value === "WESTERN VILLAGE"));
  assert.ok(f.text.some(t => t.value === "EASTERN VILLAGE"));
});

test("label eligibility follows fitted zoom rather than a fixed world scale", () => {
  for (const baseScale of [0.008, 0.016, 0.03]) {
    const f = fixture(baseScale * 100 ** (3 / 9));
    f.state.baseScale = baseScale;
    f.targets.push({name: "Outside Cardiff", category: "place", id: "place/outer", point: [-240 / f.state.scale, -80 / f.state.scale]});
    f.renderer.draw();
    assert.ok(f.text.some(t => t.value === "OUTSIDE CARDIFF"), `base scale ${baseScale}`);
  }
});

test("a searched destination can label a feature outside the old curated list", () => {
  const f = fixture();
  f.state.activeLabel = "Selected Street";
  f.targets.push({name: "Selected Street", category: "street", id: "way/selected", point: [-2000, -1000]});
  f.renderer.draw();
  assert.ok(f.text.some(t => t.value === "SELECTED STREET"));
});

test('zooming in and back out restores the original labels and hides building detail', () => {
  const f=fixture(0.016);
  f.renderer.draw();
  const initial=structuredClone(f.text);
  f.text.length=0;
  f.state.scale=0.5;
  f.renderer.draw();
  assert.ok(f.fills.includes('#f2c552'));
  f.text.length=0; f.fills.length=0;
  f.state.scale=0.016;
  f.renderer.draw();
  assert.deepEqual(f.text,initial);
  assert.ok(!f.fills.includes('#f2c552'));
});
