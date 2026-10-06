import { loadMapData } from "./map-data.js";
import { createRenderer } from "./renderer.js";
import { createCamera } from "./camera.js";
import { createTerminal } from "./terminal.js";
import { createShaderOverlay } from "./crt-overlay.js";

const canvas = document.querySelector("#map-canvas");
const screen = document.querySelector("#map-screen");
const state = {
  scale: 0.016,
  offsetX: 15,
  offsetY: 24,
  display: null,
  commandText: "",
  responseText: "READY - MOVE LUC / MOVE PONTYPRIDD / ZOOM 7",
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
  ctx.font = "12px monospace";
  ctx.fillText(message, 14, canvas.height - 24, canvas.width - 28);
}

status("LOADING MAP DATA...");
try {
  const { mapData, regionalData } = await loadMapData();
  const { draw } = createRenderer({
    canvas,
    screen,
    mapData,
    regionalData,
    state,
  });
  const camera = createCamera(state, draw);
  createTerminal({
    canvas,
    mapData,
    regionalData,
    state,
    animateTo: camera.animateTo,
    draw,
  });
  const resize = new ResizeObserver(draw);
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
