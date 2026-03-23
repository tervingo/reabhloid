// src/world.ts
import { GRID_WIDTH, GRID_HEIGHT } from "./types";
import type { CellState, Organism, ZoneId } from "./types";

export class World {
  grid: CellState[][];
  tickCount = 0;
  zoneBaseTemps: number[] = [0.2, 0.5, 0.8]; // 0–1
  zoneRegen: number[] = [0.035, 0.06, 0.015];

  reproThreshold = 1.8;
  reproCost = 0.9;
  reproChildEnergy = 0.5;
  reproCooldown = 4;

  tempStressIntensity = 0.1; // coeficiente para el castigo térmico

  constructor() {
    this.grid = [];
    this.initGrid();
    this.seedRandomOrganisms();
  }

  private initGrid() {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      const row: CellState[] = [];
      const zone = this.zoneForY(y);
      const baseTemp = this.baseTempForZone(zone);
      for (let x = 0; x < GRID_WIDTH; x++) {
        row.push({
          env: {
            temperature: baseTemp,
            nutrient: Math.random() * 1.0,
            zone,
            lastEatenTicks: 0,
          },
          org: null,
        });
      }
      this.grid.push(row);
    }
  }

  private zoneForY(y: number): ZoneId {
    const h = GRID_HEIGHT;
    if (y < h / 3) return 0;
    if (y < (2 * h) / 3) return 1;
    return 2;
  }

  private baseTempForZone(zone: ZoneId): number {
    return this.zoneBaseTemps[zone];
  }


  private seedRandomOrganisms(density = 0.2) {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (Math.random() < density) {
          const cell = this.grid[y][x];
          const tempOpt = this.baseTempForZone(cell.env.zone) + (Math.random() - 0.5) * 0.2;
          cell.org = {
            energy: 1 + Math.random(),
            age: 0,
            maxAge: 80 + Math.floor(Math.random() * 40),
            tempOpt,
            mutationRate: 0.05,
            reproThreshold: this.reproThreshold,
            reproCooldown: 0,
            isPredator: Math.random() < 0.15, // 15% depredadores
          };
        }
      }
    }
  }

  step() {
    this.tickCount++;
    this.updateEnvironment();
    this.updateOrganisms();
  }

  private updateEnvironment() {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = this.grid[y][x];

        if (cell.env.lastEatenTicks && cell.env.lastEatenTicks > 0) {
           cell.env.lastEatenTicks -= 1;
        }

        // tender hacia temperatura base de la zona
        const base = this.baseTempForZone(cell.env.zone);
        cell.env.temperature += (base - cell.env.temperature) * 0.01;

        // regen simple de nutriente, generosa
        const regen = this.zoneRegen[cell.env.zone];
        cell.env.nutrient = Math.min(1, cell.env.nutrient + regen);


       // tender a temperatura base
        cell.env.temperature += (base - cell.env.temperature) * 0.01;
      }
    }
  }

     private updateOrganisms() {
      const newGrid = this.grid.map(row =>
        row.map(cell => ({ ...cell, org: cell.org ? { ...cell.org } : null }))
      );

      for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
          const cell = this.grid[y][x];
          const org = cell.org;
          if (!org) continue;

          const newCell = newGrid[y][x];
          let newOrg = newCell.org;
          if (!newOrg) continue; // por seguridad

          // 1) edad
          newOrg.age += 1;

          // 2) coste basal
          newOrg.energy -= 0.01;

          // 3) estrés térmico
          const tempDiff = Math.abs(cell.env.temperature - newOrg.tempOpt);
          const tempPenalty = tempDiff * tempDiff * this.tempStressIntensity;
          newOrg.energy -= tempPenalty;

          // 4) comer
          const eaten = Math.min(cell.env.nutrient, 0.2);
          newCell.env.nutrient -= eaten;
          newOrg.energy += eaten * 1.0;

          // 5) muerte por energía/edad
          if (newOrg.energy <= 0 || newOrg.age > newOrg.maxAge) {
            newCell.org = null;
            continue;
          }

          // podría haber sido modificado por otra lógica, recarga referencia
          newOrg = newCell.org;
          if (!newOrg) continue;

          // 6) cooldown reproducción
          if (newOrg.reproCooldown && newOrg.reproCooldown > 0) {
            newOrg.reproCooldown -= 1;
          }

          // Predación: sólo depredadores, sólo si hambrientos, y sólo presas no depredadoras
          const hungerThreshold = 0.9;
          if (newOrg.isPredator && newOrg.energy < hungerThreshold) {
            const victimPos = this.findWeakerNeighbor(x, y, newGrid, newOrg.energy);
            if (victimPos) {
              const [vx, vy] = victimPos;
              const victimCell = newGrid[vy][vx];
              const victim = victimCell.org;
              if (victim && !victim.isPredator) { // no canibalismo (de momento)
                const gained = victim.energy * 0.7;
                newOrg.energy += gained;
                victimCell.org = null;
                victimCell.env.lastEatenTicks = 5;
              }
            }
          }


          // recarga referencia por si acaso
          newOrg = newCell.org;
          if (!newOrg) continue;

          // 8) reproducción
          const canReproduce =
            newOrg.energy > this.reproThreshold &&
            (newOrg.reproCooldown ?? 0) <= 0 &&
            newOrg.age > 5;

          if (canReproduce) {
            const pos = this.findEmptyNeighbor(x, y, newGrid);
            if (pos) {
              const [nx, ny] = pos;
              const child = this.mutateOrganism(newOrg);
              const cost = this.reproCost;
              const energyToChild = this.reproChildEnergy;

              if (newOrg.energy > cost) {
                child.energy = energyToChild;
                newOrg.energy -= cost;
                newOrg.reproCooldown = this.reproCooldown;
                newGrid[ny][nx].org = child;
              }
            }
          }
        }
      }

      this.grid = newGrid;
    }

  private findEmptyNeighbor(x: number, y: number, grid: CellState[][]): [number, number] | null {
    const candidates: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_WIDTH || ny >= GRID_HEIGHT) continue;
        if (!grid[ny][nx].org) candidates.push([nx, ny]);
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private findWeakerNeighbor(
    x: number,
    y: number,
    grid: CellState[][],
    energyA: number
  ): [number, number] | null {
    const candidates: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_WIDTH || ny >= GRID_HEIGHT) continue;
        const orgB = grid[ny][nx].org;
        if (!orgB) continue;
        // sólo vecinos más débiles y NO depredadores
        if (orgB.energy < energyA && !orgB.isPredator) {
          candidates.push([nx, ny]);
        }
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }


  private mutateOrganism(parent: Organism): Organism {
    const r = parent.mutationRate;
    const jitter = (v: number, scale: number) => v + (Math.random() * 2 - 1) * scale * r;
    return {
      energy: parent.energy,
      age: 0,
      maxAge: Math.max(20, Math.round(jitter(parent.maxAge, 10))),
      tempOpt: Math.max(0, Math.min(1, jitter(parent.tempOpt, 0.1))),
      mutationRate: Math.max(0.0, Math.min(0.2, jitter(parent.mutationRate, 0.02))),
      reproThreshold: Math.max(0.5, jitter(parent.reproThreshold, 0.3)),
      reproCooldown: 0,
      isPredator: Math.random() < 0.05 ? !parent.isPredator : parent.isPredator,
    };
  }

  getTraitStats() {
  const temps: number[] = [];
  const agesMax: number[] = [];

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const org = this.grid[y][x].org;
      if (!org) continue;
      temps.push(org.tempOpt);
      agesMax.push(org.maxAge);
    }
  }

  const tempStats = meanAndStd(temps);
  const ageStats = meanAndStd(agesMax);

  return {
    tempMean: tempStats.mean,
    tempStd: tempStats.std,
    maxAgeMean: ageStats.mean,
    count: temps.length,
  };
}

  // al final de la clase World
  getPopulation(): number {
    let count = 0;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (this.grid[y][x].org) count++;
      }
    }
    return count;
  }

  getPredatorStats(): { predators: number; total: number; fraction: number } {
  let predators = 0;
  let total = 0;
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const org = this.grid[y][x].org;
      if (!org) continue;
      total++;
      if ((org as any).isPredator) predators++;
    }
  }
  const fraction = total > 0 ? predators / total : 0;
  return { predators, total, fraction };
}


}

// funciones auxiliares

function meanAndStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (values.length === 1) return { mean, std: 0 };
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) /
    (values.length - 1);
  return { mean, std: Math.sqrt(variance) };
}

