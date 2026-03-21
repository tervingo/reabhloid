// src/main.ts
import { World } from "./world";
import { GRID_WIDTH, GRID_HEIGHT } from "./types";

const zone0Input = document.getElementById("zone0Temp") as HTMLInputElement;
const zone1Input = document.getElementById("zone1Temp") as HTMLInputElement;
const zone2Input = document.getElementById("zone2Temp") as HTMLInputElement;

const canvas = document.getElementById("world") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const restartBtn = document.getElementById("restart") as HTMLButtonElement;
const tickDelayInput = document.getElementById("tickDelay") as HTMLInputElement;
const tickSpan = document.getElementById("tickValue") as HTMLSpanElement;
const popSpan = document.getElementById("popValue") as HTMLSpanElement;
const popChartCanvas = document.getElementById("popChart") as HTMLCanvasElement;
const popChartCtx = popChartCanvas.getContext("2d")!;

const MAX_HISTORY = 200;
const popHistory: number[] = [];
let maxPopSeen = 1;



const CELL_SIZE = canvas.width / GRID_WIDTH;


let world = new World();
function updateZoneTempsFromUI() {
  world.zoneBaseTemps[0] = Number(zone0Input.value) / 100;
  world.zoneBaseTemps[1] = Number(zone1Input.value) / 100;
  world.zoneBaseTemps[2] = Number(zone2Input.value) / 100;
}
[zone0Input, zone1Input, zone2Input].forEach(input => {
  input.addEventListener("input", () => {
    updateZoneTempsFromUI();
  });
});

updateZoneTempsFromUI();

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


let lastTime = 0;
let accumulator = 0;
let tickDelay = Number(tickDelayInput.value);

tickDelayInput.addEventListener("input", () => {
  tickDelay = Number(tickDelayInput.value);
});

restartBtn.addEventListener("click", () => {
  world = new World();
  updateZoneTempsFromUI();
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = world.grid[y][x];

      // color de fondo por temperatura
      const t = cell.env.temperature; // 0-1
      const r = Math.round(50 + 150 * t);
      const b = Math.round(200 - 150 * t);
      ctx.fillStyle = `rgb(${r}, 30, ${b})`;
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);

      if (cell.org) {
        // brillo según energía
        const e = Math.max(0, Math.min(1, cell.org.energy / 3));
        const g = Math.round(80 + 175 * e);
        ctx.fillStyle = `rgb(${g}, ${g}, 0)`;
        ctx.fillRect(
          x * CELL_SIZE + 1,
          y * CELL_SIZE + 1,
          CELL_SIZE - 2,
          CELL_SIZE - 2
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
  accumulator += dt;

  while (accumulator >= tickDelay) {
    world.step();
    accumulator -= tickDelay;
  }

  draw();
  tickSpan.textContent = world.tickCount.toString();
  popSpan.textContent = world.getPopulation().toString();

  const pop = world.getPopulation();
  tickSpan.textContent = world.tickCount.toString();
  popSpan.textContent = pop.toString();
  recordPopulation(pop);
  drawPopulationChart();


  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
