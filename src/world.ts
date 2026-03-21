// src/world.ts
import { GRID_WIDTH, GRID_HEIGHT } from "./types";
import type { CellState, Organism, ZoneId } from "./types";

export class World {
  grid: CellState[][];
  tickCount = 0;
  zoneBaseTemps: number[] = [0.2, 0.5, 0.8]; // 0–1

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
            reproThreshold: 2.0,
            reproCooldown: 0,
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
        // tender hacia temperatura base de la zona
        const base = this.baseTempForZone(cell.env.zone);
        cell.env.temperature += (base - cell.env.temperature) * 0.01;

        // regen simple de nutriente
        cell.env.nutrient = Math.min(1, cell.env.nutrient + 0.01);

        // pequeño calentamiento por densidad local
        const neighborsOrg = this.countOrgNeighbors(x, y);
        cell.env.temperature += 0.001 * neighborsOrg;
        cell.env.temperature = Math.max(0, Math.min(1, cell.env.temperature));
      }
    }
  }


  private countOrgNeighbors(x: number, y: number): number {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_WIDTH || ny >= GRID_HEIGHT) continue;
        if (this.grid[ny][nx].org) count++;
      }
    }
    return count;
  }

  private updateOrganisms() {
    const newGrid = this.grid.map(row => row.map(cell => ({ ...cell, org: cell.org ? { ...cell.org } : null })));

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        const org = cell.org;
        if (!org) continue;

        const newCell = newGrid[y][x];
        const newOrg = newCell.org!;
        newOrg.age += 1;

        // coste basal: algo mayor si maxAge es alto
        const longevityFactor = Math.max(0.5, Math.min(2, org.maxAge / 80));
        newOrg.energy -= 0.015 * longevityFactor;

        const tempDiff = Math.abs(cell.env.temperature - newOrg.tempOpt);
        // curva cuadrática: castigo pequeño cerca del óptimo, fuerte lejos
        const tempPenalty = tempDiff * tempDiff * 0.3;
        newOrg.energy -= tempPenalty;

        // comer nutriente local
        const eaten = Math.min(cell.env.nutrient, 0.1);
        newCell.env.nutrient -= eaten;
        newOrg.energy += eaten * 0.8;

        // probabilidad de muerte por envejecimiento
        const ageRatio = newOrg.age / newOrg.maxAge; // 0–1+
        if (ageRatio > 0.5) {
        const extraDeathProb = (ageRatio - 0.5) * 0.1; // hasta 5% por tick cerca del final
        if (Math.random() < extraDeathProb) {
            newCell.org = null;
            continue;
        }
        }

        if (newOrg.reproCooldown && newOrg.reproCooldown > 0) {
          newOrg.reproCooldown -= 1;
        }

        // reproducción asexual
        const canReproduce =
        newOrg.energy > newOrg.reproThreshold &&
        (newOrg.reproCooldown ?? 0) <= 0 &&
        newOrg.age > 5; // evitar bebés que se reproducen instantáneamente

        if (canReproduce) {
        const pos = this.findEmptyNeighbor(x, y, newGrid);
        if (pos) {
            const [nx, ny] = pos;
            const child = this.mutateOrganism(newOrg);
            const cost = newOrg.energy * 0.6; // coste fuerte
            child.energy = cost * 0.7;
            newOrg.energy -= cost;
            newOrg.reproCooldown = 10 + Math.floor(Math.random() * 10);
            newGrid[ny][nx].org = child;
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

}
