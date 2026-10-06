import { findTargets, normalize as norm } from "./search.js";

export function createTerminal({
  canvas,
  mapData,
  regionalData,
  state,
  animateTo,
  draw,
}) {
  function moveTo(point, description) {
    state.activeLabel =
      mapData.targets.find(
        (t) => t.point[0] === point[0] && t.point[1] === point[1],
      )?.name || "";
    state.suggestions = [];
    state.selectedIndex = -1;
    animateTo(-point[0] * state.scale, -point[1] * state.scale, state.scale);
    state.responseText = "MOVING TO " + description.toUpperCase();
  }
  function executeCommand() {
    const input = state.commandText.trim();
    state.commandText = "";
    const move = input.match(
      /^move\s+(?:\{\s*location\s*:\s*([^}]+)\s*\}|(?:(place|street|landmark|address|coords|id)\s+)?(.+))$/i,
    );
    const zoom = input.match(/^zoom\s+(?:\{\s*level\s*:\s*(\d+)\s*\}|(\d+))$/i);
    if (move) {
      const category = (move[2] || "").toLowerCase(),
        name = (move[1] || move[3]).trim();
      if (
        !category &&
        /^[1-4]$/.test(name) &&
        state.suggestions[Number(name) - 1]
      ) {
        const chosen = state.suggestions[Number(name) - 1];
        moveTo(chosen.point, chosen.category + " " + chosen.name);
      } else if (category === "coords") {
        const coord = name.match(
          /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/,
        );
        const lon = coord ? Number(coord[1]) : NaN,
          lat = coord ? Number(coord[2]) : NaN;
        if (
          lon >= regionalData.bounds[0] &&
          lon <= regionalData.bounds[2] &&
          lat >= regionalData.bounds[1] &&
          lat <= regionalData.bounds[3]
        ) {
          moveTo(
            [
              Math.round((lon - mapData.origin[0]) * 69400),
              Math.round((mapData.origin[1] - lat) * 111320),
            ],
            name,
          );
        } else {
          state.suggestions = [];
          state.responseText = "COORDINATES OUTSIDE THIS EXTRACT OR INVALID";
        }
      } else if (category === "id") {
        const chosen = mapData.targets.find((t) => norm(t.id) === norm(name));
        if (chosen) moveTo(chosen.point, chosen.category + " " + chosen.name);
        else {
          state.suggestions = [];
          state.responseText = "FEATURE ID NOT FOUND IN THIS EXTRACT";
        }
      } else {
        const found = findTargets(mapData.targets, name, category);
        if (!found.length) {
          state.suggestions = [];
          state.responseText = "NO MATCH · TRY A SHORTER NAME OR TYPE HELP";
        } else if (found[0].score === 0 || found.length === 1) {
          const chosen = found[0].target;
          moveTo(chosen.point, chosen.category + " " + chosen.name);
        } else {
          state.suggestions = found.slice(0, 4).map((m) => m.target);
          state.selectedIndex = 0;
          state.responseText =
            found.length > 4
              ? "PRESS NUMBER, THEN ENTER · OR REFINE SEARCH"
              : "PRESS NUMBER, THEN ENTER";
        }
      }
    } else if (zoom) {
      state.suggestions = [];
      const level = Number(zoom[1] || zoom[2]);
      if (level < 1 || level > 10) {
        state.responseText = "LEVEL MUST BE 1-10";
        draw();
        return;
      }
      const next = 0.016 * Math.pow(100, (level - 1) / 9);
      animateTo(
        (state.offsetX * next) / state.scale,
        (state.offsetY * next) / state.scale,
        next,
      );
      state.responseText = "ZOOM LEVEL " + level;
    } else if (/^help$/i.test(input)) {
      state.suggestions = [];
      state.responseText =
        "MOVE <NAME> · MOVE PLACE/STREET/LANDMARK/ADDRESS <NAME> · ZOOM 1-10";
    } else {
      state.suggestions = [];
      state.responseText = "USE: MOVE CASTLE · MOVE PARK PLACE · ZOOM 7 · HELP";
    }
    draw();
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (e.offsetX >= 7 && e.offsetX < 260 && e.offsetY >= 7 && e.offsetY < 27) {
      window.open(
        "https://www.openstreetmap.org/copyright",
        "_blank",
        "noopener",
      );
      return;
    }
    canvas.focus();
    draw();
  });
  canvas.addEventListener("blur", draw);
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (
        !state.commandText.trim() &&
        state.selectedIndex >= 0 &&
        state.suggestions[state.selectedIndex]
      ) {
        const chosen = state.suggestions[state.selectedIndex];
        moveTo(chosen.point, chosen.category + " " + chosen.name);
        draw();
      } else executeCommand();
    } else if (
      !state.commandText &&
      state.suggestions.length &&
      /^[1-4]$/.test(e.key) &&
      Number(e.key) <= state.suggestions.length
    ) {
      e.preventDefault();
      state.selectedIndex = Number(e.key) - 1;
      draw();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      state.commandText = state.commandText.slice(0, -1);
      draw();
    } else if (e.key === "Escape") {
      state.commandText = "";
      state.suggestions = [];
      state.selectedIndex = -1;
      state.responseText = "READY";
      draw();
    } else if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      state.commandText.length < 64
    ) {
      e.preventDefault();
      state.commandText += e.key;
      draw();
    }
  });

  return { execute: executeCommand, moveTo };
}
