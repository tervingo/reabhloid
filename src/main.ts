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

let maxPopSeen = 1;
let world = new World();
let lastTime = 0;
let accumulator = 0;
let tickDelay = Number(tickDelayInput.value);
let isRunning = false;

tickDelayInput.addEventListener("input", () => {
  tickDelay = Number(tickDelayInput.value);
});


function updateSliderLabels() {
  // regen: mostramos valor efectivo (por tick)
  const r0 = (Number(zone0RegenInput.value) / 1000 * 2);
  const r1 = (Number(zone1RegenInput.value) / 1000 * 2);
  const r2 = (Number(zone2RegenInput.value) / 1000 * 2);
  zone0RegenLabel.textContent = r0.toFixed(3);
  zone1RegenLabel.textContent = r1.toFixed(3);
  zone2RegenLabel.textContent = r2.toFixed(3);

  // reproducción
  const thr = Number(reproThresholdInput.value) / 100;
  const cost = Number(reproCostInput.value) / 100;
  const childE = Number(reproChildEnergyInput.value) / 100;
  const cd = Number(reproCooldownInput.value);
  reproThresholdLabel.textContent = thr.toFixed(2);
  reproCostLabel.textContent = cost.toFixed(2);
  reproChildEnergyLabel.textContent = childE.toFixed(2);
  reproCooldownLabel.textContent = cd.toString();

  // estrés térmico
  const stress = Number(tempStressInput.value) / 100;
  tempStressLabel.textContent = stress.toFixed(2);
}


function updateInspectorFromMouse(event: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;

  const x = Math.floor(mx / CELL_SIZE);
  const y = Math.floor(my / CELL_SIZE);

  if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) {
    cellPosSpan.textContent = "-";
    cellZoneSpan.textContent = "-";
    cellAliveSpan.textContent = "no";
    cellTempOptSpan.textContent = "-";
    cellEnergySpan.textContent = "-";
    cellAgeSpan.textContent = "-";
    cellMaxAgeSpan.textContent = "-";
    return;
  }

  const cell = world.grid[y][x];
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


function updateParamsFromUI() {
  // nutriente por zona: slider 0–100 → 0–0.1
  world.zoneRegen[0] = Number(zone0RegenInput.value) / 1000 * 2; // ~0–0.2
  world.zoneRegen[1] = Number(zone1RegenInput.value) / 1000 * 2;
  world.zoneRegen[2] = Number(zone2RegenInput.value) / 1000 * 2;

  // reproducción
  world.reproThreshold = Number(reproThresholdInput.value) / 100; // 0.5–3.0 aprox
  world.reproCost = Number(reproCostInput.value) / 100;           // 0.1–2.0
  world.reproChildEnergy = Number(reproChildEnergyInput.value) / 100; // 0.1–1.5
  world.reproCooldown = Number(reproCooldownInput.value);         // 1–20 ticks

  // estrés térmico: slider 1–50 → 0.01–0.5
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
canvas.addEventListener("mouseleave", () => {
  cellPosSpan.textContent = "-";
  cellZoneSpan.textContent = "-";
  cellAliveSpan.textContent = "no";
  cellTempOptSpan.textContent = "-";
  cellEnergySpan.textContent = "-";
  cellAgeSpan.textContent = "-";
  cellMaxAgeSpan.textContent = "-";
});

function applyPresetSoft() {
  // temperaturas: frío, templado, cálido moderado
  zone0Input.value = "20";  // 10 ºC
  zone1Input.value = "50";  // 25 ºC
  zone2Input.value = "70";  // 35 ºC

  // regen nutriente (0–100 → 0–0.2 aprox)
  zone0RegenInput.value = "35";
  zone1RegenInput.value = "60";
  zone2RegenInput.value = "15";

  // reproducción
  reproThresholdInput.value = "180";     // 1.8
  reproCostInput.value = "90";           // 0.9
  reproChildEnergyInput.value = "50";    // 0.5
  reproCooldownInput.value = "4";        // 4 ticks

  // estrés térmico
  tempStressInput.value = "10";          // 0.10

  updateZoneTempsFromUI();
  updateParamsFromUI();
}

function applyPresetHarsh() {
  zone0Input.value = "10";  // 5 ºC
  zone1Input.value = "40";  // 20 ºC
  zone2Input.value = "80";  // 40 ºC

  zone0RegenInput.value = "25";
  zone1RegenInput.value = "45";
  zone2RegenInput.value = "10";

  reproThresholdInput.value = "220";     // 2.2
  reproCostInput.value = "120";          // 1.2
  reproChildEnergyInput.value = "40";    // 0.4
  reproCooldownInput.value = "7";        // 7 ticks

  tempStressInput.value = "20";          // 0.20

  updateZoneTempsFromUI();
  updateParamsFromUI();
}

function applyPresetDesert() {
  zone0Input.value = "30";  // 15 ºC
  zone1Input.value = "60";  // 30 ºC
  zone2Input.value = "90";  // 45 ºC

  zone0RegenInput.value = "20";
  zone1RegenInput.value = "30";
  zone2RegenInput.value = "5";

  reproThresholdInput.value = "190";     // 1.9
  reproCostInput.value = "95";           // 0.95
  reproChildEnergyInput.value = "45";    // 0.45
  reproCooldownInput.value = "5";

  tempStressInput.value = "18";          // 0.18

  updateZoneTempsFromUI();
  updateParamsFromUI();
}

updateZoneTempsFromUI();
updateParamsFromUI();

function recordPopulation(pop: number) {
  popHistory.push(pop);
  if (pop > maxPopSeen) maxPopSeen = pop;
  if (popHistory.length > MAX_HISTORY) {
    popHistory.shift();
  }
}

function drawPopulationChart() {
  const ctx = popChartCtx;
  const w = popChartCanvas.width;
  const h = popChartCanvas.height;

  ctx.clearRect(0, 0, w, h);

  if (popHistory.length < 2) return;

  const max = maxPopSeen || 1;
  const stepX = w / (MAX_HISTORY - 1);

  ctx.beginPath();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#8be9fd";

  popHistory.forEach((pop, i) => {
    const x = i * stepX;
    const y = h - (pop / max) * (h - 4) - 2;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // base line
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.moveTo(0, h - 1);
  ctx.lineTo(w, h - 1);
  ctx.stroke();
}

// BOTONES

const startBtn = document.getElementById("start") as HTMLButtonElement;
const restartBtn = document.getElementById("restart") as HTMLButtonElement;
const pauseBtn = document.getElementById("pause") as HTMLButtonElement;

startBtn.addEventListener("click", () => {
  // updateZoneTempsFromUI();
  updateParamsFromUI();
  isRunning = true;
  // opcional: resetear lastTime para evitar salto grande
  lastTime = performance.now();
});

pauseBtn.addEventListener("click", () => {
  isRunning = false;
});

restartBtn.addEventListener("click", () => {
  world = new World();
  accumulator = 0;
  // mantenemos isRunning como esté: si estaba corriendo, arranca desde 0; si estaba en pausa, se queda en pausa
  updateZoneTempsFromUI();
  updateParamsFromUI();
});

const presetSoftBtn = document.getElementById("presetSoft") as HTMLButtonElement;
const presetHarshBtn = document.getElementById("presetHarsh") as HTMLButtonElement;
const presetDesertBtn = document.getElementById("presetDesert") as HTMLButtonElement;

presetSoftBtn.addEventListener("click", () => {
  isRunning = false;
  world = new World();
  accumulator = 0;
  applyPresetSoft();
});

presetHarshBtn.addEventListener("click", () => {
  isRunning = false;
  world = new World();
  accumulator = 0;
  applyPresetHarsh();
});

presetDesertBtn.addEventListener("click", () => {
  isRunning = false;
  world = new World();
  accumulator = 0;
  applyPresetDesert();
});


function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = world.grid[y][x];

      // 1) Fondo por temperatura
      const t = cell.env.temperature; // 0-1
      const rBg = Math.round(50 + 150 * t);
      const bBg = Math.round(200 - 150 * t);
      ctx.fillStyle = `rgb(${rBg}, 30, ${bBg})`;
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);

      // 2) Organismo (si lo hay)
      if (cell.org) {
        const org = cell.org;

        // Color base según tempOpt
        const tOpt = org.tempOpt;
        const rBase = Math.round(50 + 205 * tOpt);
        const gBase = Math.round(200 - 100 * tOpt);
        const bBase = 0;

        // Brillo según energía
        const e = Math.max(0, Math.min(1, org.energy / 3));
        const brightness = 0.4 + 0.6 * e;

        const r = Math.round(rBase * brightness);
        const g = Math.round(gBase * brightness);
        const b = Math.round(bBase * brightness);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        // Tamaño según edad
        const ageRatio = Math.min(1, org.age / org.maxAge);
        const margin = 1 + (1 - ageRatio) * 2;
        const size = CELL_SIZE - margin * 2;

        ctx.fillRect(
          x * CELL_SIZE + margin,
          y * CELL_SIZE + margin,
          size,
          size
        );
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

function loop(timestamp: number) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  if (isRunning) {
    accumulator += dt;

    while (accumulator >= tickDelay) {
      world.step();
      accumulator -= tickDelay;
    }
  }

  draw();

  const pop = world.getPopulation();
  tickSpan.textContent = world.tickCount.toString();
  popSpan.textContent = pop.toString();

  const traits = world.getTraitStats();
  tempOptMeanSpan.textContent = (traits.tempMean * 50).toFixed(1); // ºC
  tempOptStdSpan.textContent = (traits.tempStd * 50).toFixed(1);   // ºC
  const daysPerTick = 1 / 24;
  const maxAgeDays = traits.maxAgeMean * daysPerTick;
  maxAgeMeanSpan.textContent = maxAgeDays.toFixed(1);

  recordPopulation(pop);
  drawPopulationChart();

  requestAnimationFrame(loop);
}


requestAnimationFrame(loop);
