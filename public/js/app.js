import { connectMobileTerminal } from "./mobile-terminal.js?v=20261030-mobile";
import { createDetailLoader } from "./detail-loader.js?v=20261030-mobile";
import { createRadar } from "./radar.js?v=20261030-mobile";
import { createMapExport } from "./export-map.js?v=20261030-mobile";
import { loadMapData } from "./map-data.js?v=20261030-mobile";
import { createRenderer } from "./renderer.js?v=20261030-mobile";
import { createCamera, fitOverview } from "./camera.js?v=20261030-mobile";
import { createTerminal } from "./terminal.js?v=20261030-mobile";
import { createShaderOverlay } from "./crt-overlay.js?v=20261030-mobile";

const canvas = document.querySelector("#map-canvas");
const screen = document.querySelector("#map-screen");
const state = {
  scale: 0.016,
  offsetX: 15,
  offsetY: 24,
  display: null,
  commandText: "",
  responseText: "READY - MOVE LUC / MOVE COWBRIDGE / ZOOM 7",
  cursorVisible: true,
  suggestions: [],
  selectedIndex: -1,
  activeLabel: "",
};

function status(message) {
  canvas.width = screen.clientWidth;
  canvas.height = screen.clientHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#82bad0";
  ctx.font = "15px monospace";
  ctx.fillText(message, 17.5, canvas.height - 30, canvas.width - 35);
}

status("LOADING MAP DATA...");
try {
  const { mapData, regionalData, detailManifest } = await loadMapData();
  Object.assign(state, fitOverview(regionalData.bounds, mapData.origin,
    screen.clientWidth, screen.clientHeight));
  const cardiff = mapData.targets.find(target =>
    target.category === "place" && target.name === "Cardiff");
  if (cardiff) {
    state.offsetX = -cardiff.point[0] * state.scale;
    state.offsetY = -cardiff.point[1] * state.scale - 38;
    state.activeLabel = cardiff.name;
  }
  const renderer = createRenderer({
    canvas,
    screen,
    mapData,
    regionalData,
    state,
  });
  let redrawFrame = 0;
  const detailLoader = createDetailLoader({mapData, manifest: detailManifest, redraw() {
    cancelAnimationFrame(redrawFrame);
    redrawFrame = requestAnimationFrame(() => {
      state.display?.clearHistory();
      draw();
    });
  }});
  function draw() {
    detailLoader.update(state, screen.clientWidth, screen.clientHeight);
    renderer.draw();
  }
  const camera = createCamera(state, draw);
  const radar = createRadar({state, screen, pois: mapData.pois, draw});
  const exportMap = createMapExport({canvas, state, draw});
  const terminal = createTerminal({
    canvas,
    mapData,
    regionalData,
    state,
    animateTo: camera.animateTo,
    radar, exportMap,
    draw,
  });
  connectMobileTerminal({form: document.querySelector('#mobile-terminal'),
    input: document.querySelector('#mobile-command'), state, terminal, draw});
  let width = screen.clientWidth, height = screen.clientHeight;
  const resize = new ResizeObserver(() => {
    const nextWidth = screen.clientWidth, nextHeight = screen.clientHeight;
    if (width !== nextWidth || height !== nextHeight) {
      camera.cancel();
      state.display?.clearHistory();
      radar.cancel();
      state.suggestions = []; state.selectedIndex = -1;
      const overview = fitOverview(regionalData.bounds, mapData.origin, nextWidth, nextHeight);
      const ratio = overview.baseScale / state.baseScale;
      state.scale *= ratio;
      state.offsetX *= ratio;
      state.offsetY = (state.offsetY + 38) * ratio - 38;
      state.baseScale = overview.baseScale;
      width = nextWidth; height = nextHeight;
    }
    draw();
  });
  resize.observe(screen);
  setInterval(() => {
    state.cursorVisible = !state.cursorVisible;
    draw();
  }, 520);
  draw();
  state.display = createShaderOverlay(canvas, {
    mode: "vector",
    phosphorDecay: 0.982,
  });
  canvas.focus({ preventScroll: true });
} catch (error) {
  console.error(error);
  status("MAP FAILED TO LOAD - RELOAD TO RETRY");
}
