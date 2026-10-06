export function createRenderer({
  canvas,
  screen,
  mapData,
  regionalData,
  state,
}) {
  const ctx = canvas.getContext("2d");
  let lastDrawOffsetX = state.offsetX,
    lastDrawOffsetY = state.offsetY,
    lastDrawScale = state.scale;
  const labels = mapData.targets.filter(
    (t) =>
      regionalData.labels.includes(t.name) ||
      (t.category === "place" && t.id.startsWith("node/")) ||
      [
        "Cardiff Castle",
        "Brunel House",
        "Principality Stadium",
        "Bute Park",
        "Cardiff University - Main Building",
      ].includes(t.name),
  );
  const pathBounds = new WeakMap();
  for (const points of [
    ...mapData.roads.map((r) => r.points),
    ...mapData.buildings,
    mapData.luc,
    ...mapData.water,
    ...mapData.green,
    ...regionalData.roads.map((r) => r[1]),
    ...regionalData.water,
    ...regionalData.green,
  ]) {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const [x, y] of points) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    pathBounds.set(points, [x0, y0, x1, y1]);
  }
  let visibleRect = [-Infinity, -Infinity, Infinity, Infinity];
  function visible(points) {
    const box = pathBounds.get(points);
    return (
      box &&
      box[2] >= visibleRect[0] &&
      box[0] <= visibleRect[2] &&
      box[3] >= visibleRect[1] &&
      box[1] <= visibleRect[3]
    );
  }
  const major = [],
    secondary = [],
    minor = [];
  for (const road of mapData.roads) {
    if (["motorway", "trunk", "primary", "secondary"].includes(road.class))
      major.push(road.points);
    else if (
      [
        "tertiary",
        "residential",
        "unclassified",
        "pedestrian",
        "living_street",
      ].includes(road.class)
    )
      secondary.push(road.points);
    else minor.push(road.points);
  }
  const regionalMajor = [],
    regionalSecondary = [];
  for (const [kind, points] of regionalData.roads) {
    (["motorway", "trunk", "primary", "secondary"].includes(kind)
      ? regionalMajor
      : regionalSecondary
    ).push(points);
  }
  function drawBatch(lines, color, width) {
    ctx.beginPath();
    for (const points of lines) {
      if (points.length < 2 || !visible(points)) continue;
      ctx.moveTo(...points[0]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function drawGreen() {
    ctx.beginPath();
    for (const points of [
      ...regionalData.green,
      ...(state.scale > 0.12 ? mapData.green : []),
    ]) {
      if (points.length < 4 || !visible(points)) continue;
      ctx.moveTo(...points[0]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
      ctx.closePath();
    }
    ctx.strokeStyle = "#a1d977";
    ctx.lineWidth = 0.8 / state.scale;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    const y0 = visibleRect[1],
      y1 = visibleRect[3];
    const spacing = Math.max(32, 3 / state.scale);
    for (
      let x = Math.floor((visibleRect[0] - (y1 - y0)) / spacing) * spacing;
      x < visibleRect[2];
      x += spacing
    ) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x + (y1 - y0), y1);
    }
    ctx.strokeStyle = "#76a46c";
    ctx.lineWidth = 0.48 / state.scale;
    ctx.stroke();
    ctx.restore();
  }
  function draw() {
    const w = screen.clientWidth,
      h = screen.clientHeight;
    if (state.display) {
      state.display.setMotion(
        state.offsetX - lastDrawOffsetX,
        state.offsetY - lastDrawOffsetY,
        Math.log(state.scale / lastDrawScale),
        state.offsetX,
        state.offsetY,
      );
    }
    lastDrawOffsetX = state.offsetX;
    lastDrawOffsetY = state.offsetY;
    lastDrawScale = state.scale;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    visibleRect = [
      (-w / 2 - state.offsetX) / state.scale,
      (-h / 2 - state.offsetY) / state.scale,
      (w / 2 - state.offsetX) / state.scale,
      (h / 2 - state.offsetY) / state.scale,
    ];
    ctx.save();
    ctx.translate(w / 2 + state.offsetX, h / 2 + state.offsetY);
    ctx.scale(state.scale, state.scale);
    drawGreen();
    drawBatch(regionalData.water, "#66bacb", 1.4 / state.scale);
    if (state.scale > 0.12)
      drawBatch(mapData.water, "#66bacb", 1.8 / state.scale);
    drawBatch(regionalSecondary, "#b8c2b4", 0.72 / state.scale);
    drawBatch(regionalMajor, "#ddd8ba", 1.3 / state.scale);
    if (state.scale > 0.12) {
      if (state.scale > 0.42) drawBatch(minor, "#91aaa1", 0.48 / state.scale);
      drawBatch(secondary, "#b8c2b4", 0.82 / state.scale);
      drawBatch(major, "#ddd8ba", 1.35 / state.scale);
    }
    if (state.scale > 0.29)
      drawBatch(mapData.buildings, "#b4b7ad", 0.55 / state.scale);
    if (state.scale > 0.22 && mapData.luc.length > 2 && visible(mapData.luc)) {
      ctx.beginPath();
      ctx.moveTo(...mapData.luc[0]);
      for (let i = 1; i < mapData.luc.length; i++)
        ctx.lineTo(...mapData.luc[i]);
      ctx.closePath();
      ctx.fillStyle = "#f2c552";
      ctx.fill();
      ctx.strokeStyle = "#ffe28a";
      ctx.lineWidth = 0.8 / state.scale;
      ctx.stroke();
    }
    ctx.restore();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "11px monospace";
    const majorPlaces = new Set([
      "Cardiff",
      "Barry",
      "Pontypridd",
      "Caerphilly",
      "Penarth",
      "Rhoose",
      "Rogerstone",
    ]);
    const labelLimit = state.scale < 0.04 ? 8 : state.scale < 0.12 ? 12 : 20;
    const occupied = [
      [0, 0, 270, 30],
      [w - 151, 0, w, 115],
      [
        0,
        h -
          (state.suggestions.length ? 76 + state.suggestions.length * 16 : 66) -
          26,
        w,
        h,
      ],
    ];
    const candidates = labels
      .map((label) => {
        const x = w / 2 + state.offsetX + label.point[0] * state.scale,
          y = h / 2 + state.offsetY + label.point[1] * state.scale;
        const threshold =
          label.name === state.activeLabel
            ? 0
            : majorPlaces.has(label.name)
              ? 0.016
              : regionalData.labels.includes(label.name)
                ? 0.035
                : label.category === "place"
                  ? 0.11
                  : 0.4;
        return {
          label,
          x,
          y,
          threshold,
          priority:
            label.name === state.activeLabel
              ? 0
              : majorPlaces.has(label.name)
                ? 1
                : 2,
        };
      })
      .filter(
        (v) =>
          state.scale >= v.threshold &&
          v.x > 12 &&
          v.x < w - 12 &&
          v.y > 30 &&
          v.y < h - 90,
      )
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          Math.hypot(a.x - w / 2, a.y - h / 2) -
            Math.hypot(b.x - w / 2, b.y - h / 2) ||
          a.label.name.localeCompare(b.label.name),
      );
    const used = new Set();
    let labelCount = 0;
    for (const { label, x, y, threshold } of candidates) {
      if (used.has(label.name) || labelCount >= labelLimit) continue;
      const text = label.name.toUpperCase(),
        width = ctx.measureText(text).width;
      const box = [x - width / 2 - 10, y - 14, x + width / 2 + 10, y + 14];
      if (
        box[0] < 6 ||
        box[2] > w - 6 ||
        occupied.some(
          (b) =>
            box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1],
        )
      )
        continue;
      occupied.push(box);
      used.add(label.name);
      labelCount++;
      ctx.globalAlpha =
        threshold === 0 || threshold === 0.016
          ? 1
          : Math.min(1, (state.scale / threshold - 1) * 5);
      ctx.fillStyle = "rgba(0,0,0,0.88)";
      ctx.fillRect(x - width / 2 - 4, y - 8, width + 8, 16);
      ctx.fillStyle = "#e3ba7b";
      ctx.fillText(text, x, y);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(0,0,0,0.88)";
    ctx.fillRect(w - 144, 9, 135, 99);
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    const key = [
      ["ROADS", "#ddd8ba"],
      ["BUILDINGS", "#b4b7ad"],
      ["GREEN AREAS", "#a1d977"],
      ["WATER", "#66bacb"],
      ["LABELS", "#e3ba7b"],
      ["LUC", "#f2c552"],
    ];
    key.forEach(([name, color], i) => {
      const y = 22 + i * 15;
      if (name === "LUC") {
        ctx.fillStyle = color;
        ctx.fillRect(w - 133, y - 9, 16, 10);
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w - 133, y - 3);
        ctx.lineTo(w - 117, y - 3);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.fillText(name, w - 109, y);
    });
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    function backedText(value, x, y, align = "left") {
      const width = ctx.measureText(value).width;
      ctx.fillStyle = "rgba(0,0,0,0.88)";
      ctx.fillRect(
        align === "right" ? x - width - 5 : x - 5,
        y - 12,
        width + 10,
        18,
      );
      ctx.fillStyle = "#6aa9bf";
      ctx.fillText(value, x, y);
    }
    backedText("© OPENSTREETMAP CONTRIBUTORS / ODbL", 12, 19);
    backedText("SOUTH WALES  //  OSM EXTRACT", 12, h - 76);
    const zoomLevel = Math.max(
      1,
      Math.min(
        10,
        Math.round(1 + (9 * Math.log(state.scale / 0.016)) / Math.log(100)),
      ),
    );
    ctx.textAlign = "right";
    backedText(
      "ZOOM " + String(zoomLevel).padStart(2, "0") + " / 10",
      w - 12,
      h - 76,
      "right",
    );
    ctx.textAlign = "left";
    const panelHeight = state.suggestions.length
      ? 76 + state.suggestions.length * 16
      : 66;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, h - panelHeight, w, panelHeight);
    ctx.strokeStyle = "#417890";
    ctx.beginPath();
    ctx.moveTo(0, h - panelHeight);
    ctx.lineTo(w, h - panelHeight);
    ctx.stroke();
    ctx.font = "12px monospace";
    ctx.fillStyle = "#82bad0";
    ctx.fillText(state.responseText, 14, h - panelHeight + 20, w - 28);
    for (let i = 0; i < state.suggestions.length; i++) {
      const item = state.suggestions[i];
      if (i === state.selectedIndex) {
        ctx.fillStyle = "#173d51";
        ctx.fillRect(9, h - panelHeight + 25 + i * 16, w - 18, 17);
      }
      ctx.fillStyle = i === state.selectedIndex ? "#e4f8ff" : "#82bad0";
      ctx.fillText(
        `${i + 1}  ${item.category.toUpperCase()}  ${item.name}`,
        14,
        h - panelHeight + 38 + i * 16,
        w - 28,
      );
    }
    ctx.fillStyle = "#c4edf7";
    ctx.fillText("> " + state.commandText, 14, h - 19, w - 28);
    if (state.cursorVisible) {
      const cursorX = 14 + ctx.measureText("> " + state.commandText).width;
      if (cursorX < w - 20) ctx.fillRect(cursorX, h - 28, 6, 9);
    }
  }

  return { draw };
}
