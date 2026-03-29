// src/main.ts
import { World } from "./world";
import { GRID_WIDTH, GRID_HEIGHT } from "./types";

const zone0Input = document.getElementById("zone0Temp") as HTMLInputElement;
const zone1Input = document.getElementById("zone1Temp") as HTMLInputElement;
const zone2Input = document.getElementById("zone2Temp") as HTMLInputElement;

const canvas = document.getElementById("world") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const tickDelayInput = document.getElementById("tickDelay") as HTMLInputElement;
const tickSpan = document.getElementById("tickValue") as HTMLSpanElement;
const popSpan = document.getElementById("popValue") as HTMLSpanElement;
const popChartCanvas = document.getElementById("popChart") as HTMLCanvasElement;
const popChartCtx = popChartCanvas.getContext("2d")!;

const tempOptMeanSpan = document.getElementById("tempOptMean") as HTMLSpanElement;
const tempOptStdSpan = document.getElementById("tempOptStd") as HTMLSpanElement;
const maxAgeMeanSpan = document.getElementById("maxAgeMean") as HTMLSpanElement;

const zone0Label = document.getElementById("zone0TempLabel") as HTMLSpanElement;
const zone1Label = document.getElementById("zone1TempLabel") as HTMLSpanElement;
const zone2Label = document.getElementById("zone2TempLabel") as HTMLSpanElement;

const cellPosSpan = document.getElementById("cellPos") as HTMLSpanElement;
const cellZoneSpan = document.getElementById("cellZone") as HTMLSpanElement;
const cellAliveSpan = document.getElementById("cellAlive") as HTMLSpanElement;
const cellTempOptSpan = document.getElementById("cellTempOpt") as HTMLSpanElement;
const cellEnergySpan = document.getElementById("cellEnergy") as HTMLSpanElement;
const cellAgeSpan = document.getElementById("cellAge") as HTMLSpanElement;
const cellMaxAgeSpan = document.getElementById("cellMaxAge") as HTMLSpanElement;
const cellNutrientSpan = document.getElementById("cellNutrient") as HTMLSpanElement;

const zone0RegenInput = document.getElementById("zone0Regen") as HTMLInputElement;
const zone1RegenInput = document.getElementById("zone1Regen") as HTMLInputElement;
const zone2RegenInput = document.getElementById("zone2Regen") as HTMLInputElement;

const reproThresholdInput = document.getElementById("reproThreshold") as HTMLInputElement;
const reproCostInput = document.getElementById("reproCost") as HTMLInputElement;
const reproChildEnergyInput = document.getElementById("reproChildEnergy") as HTMLInputElement;
const reproCooldownInput = document.getElementById("reproCooldown") as HTMLInputElement;

const tempStressInput = document.getElementById("tempStress") as HTMLInputElement;

const zone0RegenLabel = document.getElementById("zone0RegenLabel") as HTMLSpanElement;
const zone1RegenLabel = document.getElementById("zone1RegenLabel") as HTMLSpanElement;
const zone2RegenLabel = document.getElementById("zone2RegenLabel") as HTMLSpanElement;

const reproThresholdLabel = document.getElementById("reproThresholdLabel") as HTMLSpanElement;
const reproCostLabel = document.getElementById("reproCostLabel") as HTMLSpanElement;
const reproChildEnergyLabel = document.getElementById("reproChildEnergyLabel") as HTMLSpanElement;
const reproCooldownLabel = document.getElementById("reproCooldownLabel") as HTMLSpanElement;

const tempStressLabel = document.getElementById("tempStressLabel") as HTMLSpanElement;

const MAX_HISTORY = 200;
const popHistory: number[] = [];

const CELL_SIZE = canvas.width / GRID_WIDTH;
const INFO_BAR_HEIGHT = 40;

let maxPopSeen = 1;
let world: World;
let lastTime = 0;
let accumulator = 0;
let tickDelay = Number(tickDelayInput.value);
let isRunning = false;
let animationId: number | null = null;
let listenersAttached = false;

// === API para boot.ts ===
export function initEcologyMode(): () => void {
  world = new World();
  accumulator = 0;
  tickDelay = Number(tickDelayInput.value);
  isRunning = false;
  lastTime = performance.now();
  maxPopSeen = 1;
  popHistory.length = 0;

  updateZoneTempsFromUI();
  updateParamsFromUI();
  updateSliderLabels();
  applyPresetSoft(); // o comenta esto si no quieres preset por defecto

  if (!listenersAttached) {
    listenersAttached = true;
    attachListeners();
  }

  // primer render
  updateUIAndDraw();
  drawPopulationChart();

  if (animationId === null) {
    const loopWrapper = (t: number) => {
      loop(t);
      animationId = requestAnimationFrame(loopWrapper);
    };
    animationId = requestAnimationFrame(loopWrapper);
  }

  return () => {
    isRunning = false;
  };
}

// === Lógica de UI y simulación ===

tickDelayInput.addEventListener("input", () => {
  tickDelay = Number(tickDelayInput.value);
});

function updateSliderLabels() {
  const r0 = (Number(zone0RegenInput.value) / 1000) * 2;
  const r1 = (Number(zone1RegenInput.value) / 1000) * 2;
  const r2 = (Number(zone2RegenInput.value) / 1000) * 2;
  zone0RegenLabel.textContent = r0.toFixed(3);
  zone1RegenLabel.textContent = r1.toFixed(3);
  zone2RegenLabel.textContent = r2.toFixed(3);

  const thr = Number(reproThresholdInput.value) / 100;
  const cost = Number(reproCostInput.value) / 100;
  const childE = Number(reproChildEnergyInput.value) / 100;
  const cd = Number(reproCooldownInput.value);
  reproThresholdLabel.textContent = thr.toFixed(2);
  reproCostLabel.textContent = cost.toFixed(2);
  reproChildEnergyLabel.textContent = childE.toFixed(2);
  reproCooldownLabel.textContent = cd.toString();

  const stress = Number(tempStressInput.value) / 100;
  tempStressLabel.textContent = stress.toFixed(2);
}

function updateInspectorFromMouse(event: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;

  // ignorar la barra superior
  const myInGrid = my - INFO_BAR_HEIGHT;
  if (myInGrid < 0) {
    // ratón en la barra: limpiar inspector
    cellPosSpan.textContent = "-";
    cellZoneSpan.textContent = "-";
    cellAliveSpan.textContent = "no";
    cellTempOptSpan.textContent = "-";
    cellEnergySpan.textContent = "-";
    cellAgeSpan.textContent = "-";
    cellMaxAgeSpan.textContent = "-";
    cellNutrientSpan.textContent = "-";
    return;
  }

  const x = Math.floor(mx / CELL_SIZE);
  const y = Math.floor(myInGrid / CELL_SIZE);

  if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) {
    cellPosSpan.textContent = "-";
    cellZoneSpan.textContent = "-";
    cellAliveSpan.textContent = "no";
    cellTempOptSpan.textContent = "-";
    cellEnergySpan.textContent = "-";
    cellAgeSpan.textContent = "-";
    cellMaxAgeSpan.textContent = "-";
    cellNutrientSpan.textContent = "-";
    return;
  }

  const cell = world.grid[y][x];
  cellNutrientSpan.textContent = cell.env.nutrient.toFixed(3);
  cellPosSpan.textContent = `${x}, ${y}`;
  cellZoneSpan.textContent = cell.env.zone.toString();

  if (!cell.org) {
    cellAliveSpan.textContent = "no";
    cellTempOptSpan.textContent = "-";
    cellEnergySpan.textContent = "-";
    cellAgeSpan.textContent = "-";
    cellMaxAgeSpan.textContent = "-";
  } else {
    const org = cell.org;
    cellAliveSpan.textContent = "sí";
    cellTempOptSpan.textContent = (org.tempOpt * 50).toFixed(1) + " ºC";
    cellEnergySpan.textContent = org.energy.toFixed(2);
    cellAgeSpan.textContent = org.age.toString();
    const daysPerTick = 1 / 24;
    const maxAgeDays = org.maxAge * daysPerTick;
    cellMaxAgeSpan.textContent = `${org.maxAge} ticks (~${maxAgeDays.toFixed(1)} días)`;
  }
}

function clearInspector() {
  cellPosSpan.textContent = "-";
  cellZoneSpan.textContent = "-";
  cellAliveSpan.textContent = "no";
  cellTempOptSpan.textContent = "-";
  cellEnergySpan.textContent = "-";
  cellAgeSpan.textContent = "-";
  cellMaxAgeSpan.textContent = "-";
  cellNutrientSpan.textContent = "-";
}

function updateParamsFromUI() {
  world.zoneRegen[0] = (Number(zone0RegenInput.value) / 1000) * 2;
  world.zoneRegen[1] = (Number(zone1RegenInput.value) / 1000) * 2;
  world.zoneRegen[2] = (Number(zone2RegenInput.value) / 1000) * 2;

  world.reproThreshold = Number(reproThresholdInput.value) / 100;
  world.reproCost = Number(reproCostInput.value) / 100;
  world.reproChildEnergy = Number(reproChildEnergyInput.value) / 100;
  world.reproCooldown = Number(reproCooldownInput.value);

  world.tempStressIntensity = Number(tempStressInput.value) / 100;

  updateSliderLabels();
}

function updateZoneTempsFromUI() {
  world.zoneBaseTemps[0] = Number(zone0Input.value) / 100;
  world.zoneBaseTemps[1] = Number(zone1Input.value) / 100;
  world.zoneBaseTemps[2] = Number(zone2Input.value) / 100;

  zone0Label.textContent = (world.zoneBaseTemps[0] * 50).toFixed(1);
  zone1Label.textContent = (world.zoneBaseTemps[1] * 50).toFixed(1);
  zone2Label.textContent = (world.zoneBaseTemps[2] * 50).toFixed(1);
}

function attachListeners() {
  [zone0Input, zone1Input, zone2Input].forEach(input => {
    input.addEventListener("input", () => {
      updateZoneTempsFromUI();
    });
  });

  [
    zone0RegenInput,
    zone1RegenInput,
    zone2RegenInput,
    reproThresholdInput,
    reproCostInput,
    reproChildEnergyInput,
    reproCooldownInput,
    tempStressInput,
  ].forEach(input => {
    input.addEventListener("input", () => {
      updateParamsFromUI();
    });
  });

  canvas.addEventListener("mousemove", updateInspectorFromMouse);
  canvas.addEventListener("mouseleave", clearInspector);

  const startBtn = document.getElementById("start") as HTMLButtonElement;
  const restartBtn = document.getElementById("restart") as HTMLButtonElement;
  const pauseBtn = document.getElementById("pause") as HTMLButtonElement;
  const stepBtn = document.getElementById("step") as HTMLButtonElement;

  startBtn.addEventListener("click", () => {
    updateParamsFromUI();
    isRunning = true;
    lastTime = performance.now();
  });

  pauseBtn.addEventListener("click", () => {
    isRunning = false;
  });

  restartBtn.addEventListener("click", () => {
    world = new World();
    accumulator = 0;
    updateZoneTempsFromUI();
    updateParamsFromUI();
    updateUIAndDraw();
  });

  stepBtn.addEventListener("click", () => {
    isRunning = false;
    world.step();
    updateUIAndDraw();
    recordPopulation(world.getPopulation());
    drawPopulationChart();
  });

  const presetSoftBtn = document.getElementById("presetSoft") as HTMLButtonElement;
  const presetHarshBtn = document.getElementById("presetHarsh") as HTMLButtonElement;
  const presetDesertBtn = document.getElementById("presetDesert") as HTMLButtonElement;

  presetSoftBtn.addEventListener("click", () => {
    isRunning = false;
    world = new World();
    accumulator = 0;
    applyPresetSoft();
    updateUIAndDraw();
  });

  presetHarshBtn.addEventListener("click", () => {
    isRunning = false;
    world = new World();
    accumulator = 0;
    applyPresetHarsh();
    updateUIAndDraw();
  });

  presetDesertBtn.addEventListener("click", () => {
    isRunning = false;
    world = new World();
    accumulator = 0;
    applyPresetDesert();
    updateUIAndDraw();
  });
}

function applyPresetSoft() {
  zone0Input.value = "20";
  zone1Input.value = "50";
  zone2Input.value = "70";

  zone0RegenInput.value = "35";
  zone1RegenInput.value = "60";
  zone2RegenInput.value = "15";

  reproThresholdInput.value = "180";
  reproCostInput.value = "90";
  reproChildEnergyInput.value = "50";
  reproCooldownInput.value = "4";

  tempStressInput.value = "10";

  updateZoneTempsFromUI();
  updateParamsFromUI();
}

function applyPresetHarsh() {
  zone0Input.value = "10";
  zone1Input.value = "40";
  zone2Input.value = "80";

  zone0RegenInput.value = "25";
  zone1RegenInput.value = "45";
  zone2RegenInput.value = "10";

  reproThresholdInput.value = "220";
  reproCostInput.value = "120";
  reproChildEnergyInput.value = "40";
  reproCooldownInput.value = "7";

  tempStressInput.value = "20";

  updateZoneTempsFromUI();
  updateParamsFromUI();
}

function applyPresetDesert() {
  zone0Input.value = "30";
  zone1Input.value = "60";
  zone2Input.value = "90";

  zone0RegenInput.value = "20";
  zone1RegenInput.value = "30";
  zone2RegenInput.value = "5";

  reproThresholdInput.value = "190";
  reproCostInput.value = "95";
  reproChildEnergyInput.value = "45";
  reproCooldownInput.value = "5";

  tempStressInput.value = "18";

  updateZoneTempsFromUI();
  updateParamsFromUI();
}

function recordPopulation(pop: number) {
  popHistory.push(pop);
  if (pop > maxPopSeen) maxPopSeen = pop;
  if (popHistory.length > MAX_HISTORY) {
    popHistory.shift();
  }
}

function drawPopulationChart() {
  const w = popChartCanvas.width;
  const h = popChartCanvas.height;

  popChartCtx.clearRect(0, 0, w, h);

  if (popHistory.length < 2) return;

  const max = maxPopSeen || 1;
  const stepX = w / (MAX_HISTORY - 1);

  popChartCtx.beginPath();
  popChartCtx.lineWidth = 1;
  popChartCtx.strokeStyle = "#8be9fd";

  popHistory.forEach((pop, i) => {
    const x = i * stepX;
    const y = h - (pop / max) * (h - 4) - 2;
    if (i === 0) {
      popChartCtx.moveTo(x, y);
    } else {
      popChartCtx.lineTo(x, y);
    }
  });

  popChartCtx.stroke();

  popChartCtx.strokeStyle = "rgba(255,255,255,0.2)";
  popChartCtx.beginPath();
  popChartCtx.moveTo(0, h - 1);
  popChartCtx.lineTo(w, h - 1);
  popChartCtx.stroke();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, INFO_BAR_HEIGHT);

  ctx.fillStyle = "#ffffff";
  ctx.font = "20px monospace";
  ctx.textBaseline = "middle";

  const tickText = `Tick: ${world.tickCount}`;
  const popText = `Pop: ${world.getPopulation()}`;

  const predStats = world.getPredatorStats();
  const predPercent = (predStats.fraction * 100).toFixed(1);
  const predText = `Pred: ${predPercent}%`;

  ctx.fillText(tickText, 6, INFO_BAR_HEIGHT / 2);
  ctx.fillText(popText, 140, INFO_BAR_HEIGHT / 2);
  ctx.fillText(predText, 300, INFO_BAR_HEIGHT / 2);

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = world.grid[y][x];
      const n = cell.env.nutrient;

      let rBg = 0;
      let gBg = 0;
      let bBg = 0;

      switch (cell.env.zone) {
        case 0:
          rBg = 0;
          gBg = Math.round(20 + 40 * n);
          bBg = Math.round(60 + 180 * n);
          break;
        case 1:
          rBg = Math.round(20 + 40 * n);
          gBg = Math.round(80 + 170 * n);
          bBg = Math.round(20 + 40 * n);
          break;
        case 2:
          rBg = Math.round(80 + 170 * n);
          gBg = Math.round(20 + 40 * n);
          bBg = Math.round(20 + 40 * n);
          break;
      }

      ctx.fillStyle = `rgb(${rBg}, ${gBg}, ${bBg})`;
      ctx.fillRect(
        x * CELL_SIZE,
        INFO_BAR_HEIGHT + y * CELL_SIZE,
        CELL_SIZE,
        CELL_SIZE
      );

      if (cell.org) {
        const org = cell.org;

        // color por desajuste térmico
        const tEnv = cell.env.temperature;
        const tOpt = org.tempOpt;
        const diff = Math.abs(tEnv - tOpt);
        const diffClamped = Math.min(0.5, diff) / 0.5;
        const r = Math.round(255 * diffClamped);
        const g = Math.round(255 * (1 - diffClamped));
        const b = 40;
        const e = Math.max(0, Math.min(1, org.energy / 3));
        const brightness = 0.4 + 0.6 * e;
        const rFinal = Math.round(r * brightness);
        const gFinal = Math.round(g * brightness);
        const bFinal = Math.round(b * brightness);
        ctx.fillStyle = `rgb(${rFinal}, ${gFinal}, ${bFinal})`;

        const ageRatio = org.maxAge > 0 ? org.age / org.maxAge : 0;
        const cx = x * CELL_SIZE + CELL_SIZE / 2;
        const cy = INFO_BAR_HEIGHT + y * CELL_SIZE + CELL_SIZE / 2;
        const size = CELL_SIZE * 0.35;

        if (org.age <= 10) {
          drawStar(ctx, cx, cy, size);
        } else if (ageRatio <= 0.33) {
          drawCircle(ctx, cx, cy, size);
        } else if (ageRatio <= 0.66) {
          drawSquare(ctx, cx, cy, size);
        } else if (ageRatio <= 0.9) {
          drawTriangle(ctx, cx, cy, size);
        } else {
          drawCross(ctx, cx, cy, size);
        }
      }

      if (!cell.org && cell.env.lastEatenTicks && cell.env.lastEatenTicks > 0) {
        const cx = x * CELL_SIZE + CELL_SIZE / 2;
        const cy = INFO_BAR_HEIGHT + y * CELL_SIZE + CELL_SIZE / 2;
        const size = CELL_SIZE * 0.35;

        ctx.save();
        ctx.strokeStyle = "orangeRed";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - size, cy - size);
        ctx.lineTo(cx + size, cy + size);
        ctx.moveTo(cx - size, cy + size);
        ctx.lineTo(cx + size, cy - size);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // opcional: grid lines
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= GRID_WIDTH; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE + 0.5, 0);
    ctx.lineTo(x * CELL_SIZE + 0.5, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_HEIGHT; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE + 0.5);
    ctx.lineTo(canvas.width, y * CELL_SIZE + 0.5);
    ctx.stroke();
  }
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawSquare(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  half: number
) {
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
) {
  const h = size * Math.sqrt(3);
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx - size, cy + h / 2);
  ctx.lineTo(cx + size, cy + h / 2);
  ctx.closePath();
  ctx.fill();
}

function drawCross(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
) {
  const half = size;
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx + half, cy + half);
  ctx.moveTo(cx - half, cy + half);
  ctx.lineTo(cx + half, cy - half);
  ctx.stroke();
  ctx.restore();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number
) {
  const innerR = outerR * 0.5;
  const spikes = 5;
  let rot = -Math.PI / 2;
  const step = Math.PI / spikes;
  ctx.beginPath();
  for (let i = 0; i < spikes; i++) {
    const xOuter = cx + Math.cos(rot) * outerR;
    const yOuter = cy + Math.sin(rot) * outerR;
    ctx.lineTo(xOuter, yOuter);
    rot += step;

    const xInner = cx + Math.cos(rot) * innerR;
    const yInner = cy + Math.sin(rot) * innerR;
    ctx.lineTo(xInner, yInner);
    rot += step;
  }
  ctx.closePath();
  ctx.fill();
}

function updateUIAndDraw() {
  draw();
  const pop = world.getPopulation();
  tickSpan.textContent = world.tickCount.toString();
  popSpan.textContent = pop.toString();

  const traits = world.getTraitStats();
  tempOptMeanSpan.textContent = (traits.tempMean * 50).toFixed(1);
  tempOptStdSpan.textContent = (traits.tempStd * 50).toFixed(1);
  const daysPerTick = 1 / 24;
  const maxAgeDays = traits.maxAgeMean * daysPerTick;
  maxAgeMeanSpan.textContent = maxAgeDays.toFixed(1);
}

function loop(timestamp: number) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  if (isRunning) {
    accumulator += dt;
    while (accumulator >= tickDelay) {
      world.step();
      accumulator -= tickDelay;
      updateUIAndDraw();
      recordPopulation(world.getPopulation());
      drawPopulationChart();
    }
  }
}