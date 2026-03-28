import { initEcologyMode } from "./main";
import { initSpeciesMode } from "./main_species";

let currentCleanup: (() => void) | null = null;

function switchMode(mode: "ecology" | "species") {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  currentCleanup = mode === "ecology" ? initEcologyMode() : initSpeciesMode();
}

window.addEventListener("DOMContentLoaded", () => {
  const modeSelect = document.getElementById("modeSelect") as HTMLSelectElement;

  // Modo por defecto: especies
  switchMode("species");
  modeSelect.value = "species";

  modeSelect.addEventListener("change", () => {
    const value = modeSelect.value === "ecology" ? "ecology" : "species";
    switchMode(value);
  });
});