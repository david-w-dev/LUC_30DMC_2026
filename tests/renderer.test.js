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
  return { renderer, text, fills };
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
