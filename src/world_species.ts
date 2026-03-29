// src/world_species.ts
import { GRID_WIDTH, GRID_HEIGHT } from "./types";
import type { CellStateSpecies, OrganismSpecies, ZoneId } from "./types";

export class WorldSpecies {
  grid: CellStateSpecies[][];
  tickCount = 0;
  zoneBaseTemps: number[] = [0.2, 0.5, 0.8]; // 0–1
  zoneRegen: number[] = [0.035, 0.06, 0.015];

  reproThreshold = 1.8;
  reproCost = 0.9;
  reproChildEnergy = 0.5;
  reproCooldown = 4;

  tempStressIntensity = 0.1;

  // Especies
  speciesCounter = 1;
  speciesMap = new Map<number, { color: string }>();

  constructor() {
    this.grid = [];
    this.initGrid();             // SOLO crea ambiente, sin organismos
  }

  private resetGridEmpty() {
    this.grid = [];
    this.initGrid();
    this.tickCount = 0;
  }

  seedSingleAncestor(initialMutationRate: number) {
    this.resetGridEmpty();

    const baseSpecies = this.createSpecies();

    const x = Math.floor(GRID_WIDTH / 2);
    const y = Math.floor(GRID_HEIGHT / 2);
    const cell = this.grid[y][x];
    const tempOpt = this.baseTempForZone(cell.env.zone);

    cell.org = {
      energy: 1,
      age: 0,
      maxAge: 80,
      tempOpt,
      mutationRate: initialMutationRate,
      reproThreshold: this.reproThreshold,
      reproCooldown: 0,
      isPredator: false,
      predationIndex: 0.5,   // valor medio inicial
      speciesId: baseSpecies,
      founderId: baseSpecies,
      // speciationMarkerTicks opcionalmente 0/undefined
    };
  }

  private updateOrganisms() {
    const newGrid = this.grid.map(row =>
      row.map(cell => ({
        ...cell,
        org: cell.org ? { ...cell.org } : null,
      }))
    );

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        const org = cell.org;
        if (!org) continue;

        const newCell = newGrid[y][x];
        let newOrg = newCell.org;
        if (!newOrg) continue;

        // 1) edad
        newOrg.age += 1;

        // marcador especiación
        if (newOrg.speciationMarkerTicks && newOrg.speciationMarkerTicks > 0) {
          newOrg.speciationMarkerTicks -= 1;
        }

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

        // 5) muerte
        if (newOrg.energy <= 0 || newOrg.age > newOrg.maxAge) {
          newCell.org = null;
          continue;
        }

        newOrg = newCell.org;
        if (!newOrg) continue;

        // 6) cooldown reproducción
        if (newOrg.reproCooldown && newOrg.reproCooldown > 0) {
          newOrg.reproCooldown -= 1;
        }

        // 7) predación (solo depredadores hambrientos, solo presas no depredadoras)
        const hungerThreshold = 1.3;
        if (newOrg.isPredator && newOrg.energy < hungerThreshold) {
          const victimPos = this.findPreyWithPolicy(x, y, newGrid, newOrg);
          if (victimPos) {
            const [vx, vy] = victimPos;
            const victimCell = newGrid[vy][vx];
            const victim = victimCell.org;
            if (victim) {
              const gained = victim.energy * 0.7;
              newOrg.energy += gained;
              victimCell.org = null;
              victimCell.env.lastEatenTicks = 5;
            }
          }
        }
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

  private mutateOrganism(parent: OrganismSpecies): OrganismSpecies {
    const r = parent.mutationRate;
    const jitter = (v: number, scale: number) =>
      v + (Math.random() * 2 - 1) * scale * r;

    let child: OrganismSpecies = {
      energy: parent.energy,
      age: 0,
      maxAge: Math.max(20, Math.round(jitter(parent.maxAge, 10))),
      tempOpt: Math.max(0, Math.min(1, jitter(parent.tempOpt, 0.1))),
      mutationRate: parent.mutationRate,
      reproThreshold: Math.max(0.5, jitter(parent.reproThreshold, 0.3)),
      reproCooldown: 0,
      // flip de depredador raro
      isPredator:
        Math.random() < 0.05 ? !parent.isPredator : parent.isPredator,
      predationIndex: Math.max(
        0,
        Math.min(1, jitter(parent.predationIndex, 0.6))
      ),
      speciesId: parent.speciesId,
      founderId: parent.founderId,
    };

    if (this.shouldSpeciate(parent, child)) {
      const newSpeciesId = this.createSpecies();
      child = {
        ...child,
        speciesId: newSpeciesId,
        founderId: newSpeciesId,
        speciationMarkerTicks: 10,
      };
    }

    return child;
  }

  private shouldSpeciate(parent: OrganismSpecies, child: OrganismSpecies): boolean {
    let diffCount = 0;
    const m = parent.mutationRate;

    // umbrales muy bajos, acordes con jitter * M
    if (Math.abs(child.tempOpt - parent.tempOpt) > 0.003) diffCount++;
    if (Math.abs(child.mutationRate - parent.mutationRate) > 0.0005) diffCount++;
    if (Math.abs(child.maxAge - parent.maxAge) > 1.5) diffCount++;
    if (Math.abs(child.reproThreshold - parent.reproThreshold) > 0.03) diffCount++;

    // si quieres, puedes quitar por ahora el cambio de isPredator del criterio
    // if (child.isPredator !== parent.isPredator) diffCount++;

    if (diffCount > 0) {
      console.log("diffCount =", diffCount, "M =", m);
    }

    if (diffCount === 0) return false;

    // probabilidad base según diffCount
    let baseP = 0;
    if (diffCount === 1) baseP = 0.02;   // 2%
    else if (diffCount === 2) baseP = 0.06;
    else baseP = 0.15;

    // factor según M: M=0.02→0.4, M=0.05→0.75, M=0.1→1.25 (cap a 2)
    const mFactor = Math.min(2, 0.2 + m * 10);
    const p = Math.min(0.9, baseP * mFactor);

    return Math.random() < p;
  }

  private findPreyWithPolicy(
    x: number,
    y: number,
    grid: CellStateSpecies[][],
    predator: OrganismSpecies
  ): [number, number] | null {
    const candidates: [number, number][] = [];
    const pIndex = predator.predationIndex; // 0..1

    // factor según predationIndex: qué energía máxima tolera en la presa
    const minFactor = 0.3;  // pIndex = 0: solo mucho más débiles
    const maxFactor = 2;  // pIndex = 1: puede atacar algo más fuerte
    const factor = minFactor + (maxFactor - minFactor) * pIndex;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_WIDTH || ny >= GRID_HEIGHT) continue;

        const prey = grid[ny][nx].org;
        if (!prey) continue;

        // evitar canibalismo salvo que esté bastante hambriento
        const sameSpecies = prey.speciesId === predator.speciesId;
        if (sameSpecies && predator.energy > 0.5) continue;

        // condición solo por energía relativa y predationIndex
        if (prey.energy <= predator.energy * factor) {
          candidates.push([nx, ny]);
        }
      }
    }

    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }


  private initGrid() {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      const row: CellStateSpecies[] = [];
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

  private createSpecies(): number {
    const id = this.speciesCounter++;
    const hue = (id * 157) % 360;
    const color = `hsl(${hue}, 90%, 50%)`;
    this.speciesMap.set(id, { color });
    return id;
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

        const base = this.baseTempForZone(cell.env.zone);
        cell.env.temperature += (base - cell.env.temperature) * 0.01;

        const regen = this.zoneRegen[cell.env.zone];
        cell.env.nutrient = Math.min(1, cell.env.nutrient + regen);

        cell.env.temperature += (base - cell.env.temperature) * 0.01;
      }
    }
  }

  private findEmptyNeighbor(
    x: number,
    y: number,
    grid: CellStateSpecies[][]
  ): [number, number] | null {
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

  getPopulation(): number {
    let count = 0;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (this.grid[y][x].org) count++;
      }
    }
    return count;
  }

  getLiveSpeciesCount(): number {
    const seen = new Set<number>();
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const org = this.grid[y][x].org;
        if (org) seen.add(org.speciesId);
      }
    }
    return seen.size;
  }
}

// auxiliares
function meanAndStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (values.length === 1) return { mean, std: 0 };
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) /
    (values.length - 1);
  return { mean, std: Math.sqrt(variance) };
}