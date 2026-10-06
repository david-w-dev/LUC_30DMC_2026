import test from "node:test";
import assert from "node:assert/strict";
import {readDataset} from "./data.js";
import { findTargets } from "../public/js/search.js";
import { createTerminal } from "../public/js/terminal.js";

const central = readDataset('cardiff-map');
const region = readDataset('regional-map');
const categories = { p: "place", s: "street", l: "landmark", a: "address" };
const targets = [...central.targets, ...region.targets].map(
  ([category, name, id, x, y, cy]) => ({
    category: categories[category],
    name,
    id,
    point: [x, y],
    cy,
  }),
);

function fixture() {
  const handlers = new Map();
  const moves = [];
  const state = {
    scale: 0.16,
    offsetX: 20,
    offsetY: 30,
    commandText: "",
    responseText: "",
    suggestions: [],
    selectedIndex: -1,
    activeLabel: "",
  };
  const terminal = createTerminal({
    canvas: {
      addEventListener: (name, handler) => handlers.set(name, handler),
      focus() {},
    },
    state,
    mapData: { ...central, targets },
    regionalData: region,
    draw() {},
    animateTo: (...args) => moves.push(args),
  });
  return {
    state,
    moves,
    handlers,
    run(command) {
      state.commandText = command;
      terminal.execute();
    },
  };
}

test("LUC resolves to the building without renaming it", () => {
  for (const category of [undefined, "place", "landmark"]) {
    const match = findTargets(targets, "LUC", category)[0];
    assert.equal(match.score, 0);
    assert.equal(match.target.name, "Brunel House");
    assert.equal(match.target.id, "way/26579743");
  }
  const f = fixture();
  f.run("move LUC");
  assert.equal(f.state.activeLabel, "Brunel House");
  assert.match(f.state.responseText, /BRUNEL HOUSE/);
  assert.equal(f.moves.length, 1);
});

test("regional destinations and Welsh names are searchable", () => {
  for (const name of ["Rhoose", "Pontypridd", "Rogerstone", "Cardiff"]) {
    assert.equal(findTargets(targets, name, "place")[0].target.name, name);
  }
  assert.equal(findTargets(targets, "Caerdydd")[0].target.name, "Cardiff");
});

test("failed entries clear the command field", () => {
  const f = fixture();
  f.run("move a place that does not exist xyz123");
  assert.equal(f.state.commandText, "");
  assert.match(f.state.responseText, /NO MATCH/);
  assert.equal(f.moves.length, 0);
});

test("number highlights a suggestion and Enter navigates to it", () => {
  const f = fixture();
  f.run("move cast");
  assert.ok(f.state.suggestions.length > 1);
  assert.ok(f.state.suggestions.length <= 4);
  const expected = f.state.suggestions[1].name;
  const event = (key) => ({ key, preventDefault() {} });
  f.handlers.get("keydown")(event("2"));
  assert.equal(f.state.selectedIndex, 1);
  assert.equal(f.moves.length, 0);
  f.handlers.get("keydown")(event("Enter"));
  assert.equal(f.state.activeLabel, expected);
  assert.equal(f.moves.length, 1);
});

test("zoom preserves the camera centre and rejects invalid levels", () => {
  const f = fixture();
  f.run("zoom 10");
  const [x, y, scale] = f.moves[0];
  assert.equal(scale, 1.6);
  assert.equal(x / scale, f.state.offsetX / f.state.scale);
  assert.equal(y / scale, f.state.offsetY / f.state.scale);
  f.run("zoom 11");
  assert.match(f.state.responseText, /LEVEL MUST BE/);
  assert.equal(f.moves.length, 1);
});

test("structured commands and coordinate bounds work", () => {
  const f = fixture();
  f.run("move {location: LUC}");
  assert.equal(f.state.activeLabel, "Brunel House");
  f.run("zoom {level: 3}");
  assert.equal(f.moves.length, 2);
  f.run("move coords -3.2,51.5");
  assert.equal(f.moves.length, 3);
  f.run("move coords -8,0");
  assert.match(f.state.responseText, /OUTSIDE/);
  assert.equal(f.moves.length, 3);
});
