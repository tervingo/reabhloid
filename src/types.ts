// src/types.ts
export const GRID_WIDTH = 50;
export const GRID_HEIGHT = 50;

export type ZoneId = 0 | 1 | 2;

export interface CellEnv {
  temperature: number;
  nutrient: number;
  zone: ZoneId;
}

export interface OrganismEcology {
  energy: number;
  age: number;
  maxAge: number;
  tempOpt: number;
  mutationRate: number;
  reproThreshold: number;
  reproCooldown: number;
  isPredator: boolean;
}

export interface OrganismSpecies {
  energy: number;
  age: number;
  maxAge: number;
  tempOpt: number;
  mutationRate: number;
  reproThreshold: number;
  reproCooldown: number;
  isPredator: boolean;       
  predationIndex: number;        // 0–1, estrategia de depredación
  speciesId: number;
  founderId: number;
  speciationMarkerTicks?: number;
}

export interface CellStateEcology {
  env: CellEnv;
  org: OrganismEcology | null;
}

export interface CellStateSpecies {
  env: CellEnv;
  org: OrganismSpecies | null;
}

export interface CellEnv {
  temperature: number;
  nutrient: number;
  zone: ZoneId;
  lastEatenTicks: number; // 0 si nada, >0 si recién comida
}
