// src/types.ts
export const GRID_WIDTH = 50;
export const GRID_HEIGHT = 50;

export type ZoneId = 0 | 1 | 2;

export interface CellEnv {
  temperature: number;
  nutrient: number;
  zone: ZoneId;
}

export interface Organism {
  energy: number;
  age: number;
  maxAge: number;
  tempOpt: number;
  mutationRate: number;
  reproThreshold: number;
  reproCooldown?: number; // ticks hasta poder reproducirse otra vez
  isPredator: boolean; 
}

export interface CellState {
  env: CellEnv;
  org: Organism | null;
}

export interface CellEnv {
  temperature: number;
  nutrient: number;
  zone: ZoneId;
  lastEatenTicks?: number; // 0 si nada, >0 si recién comida
}
