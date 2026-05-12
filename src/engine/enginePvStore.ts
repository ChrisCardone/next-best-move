import { create } from 'zustand';
import type { PvLine } from './uciParser';

/**
 * In-memory store for live engine PV lines. Not persisted — Maps don't
 * survive a JSON round-trip and a stale PV after reload would be more
 * confusing than helpful. Kept separate from `engineStore` (which holds
 * persisted user settings) for that reason.
 */
interface EnginePvState {
  /** Lines keyed by multipv index (1-based), most recent info per slot. */
  lines: Map<number, PvLine>;
  /** FEN the current `lines` correspond to. */
  analyzedFen: string | null;
  /** Threat lines keyed by multipv index (1-based). */
  threatLines: Map<number, PvLine>;
  /** FEN the current `threatLines` correspond to. */
  threatAnalyzedFen: string | null;

  updateLine(line: PvLine): void;
  setAnalyzedFen(fen: string | null): void;
  clearLines(): void;
  updateThreatLine(line: PvLine): void;
  setThreatAnalyzedFen(fen: string | null): void;
  clearThreatLines(): void;
  /** Reset everything — used when the user toggles the engine off. */
  resetAll(): void;
}

export const useEnginePvStore = create<EnginePvState>((set) => ({
  lines: new Map(),
  analyzedFen: null,
  threatLines: new Map(),
  threatAnalyzedFen: null,

  updateLine: (line) =>
    set((s) => {
      const next = new Map(s.lines);
      next.set(line.multipv, line);
      return { lines: next };
    }),
  setAnalyzedFen: (fen) => set({ analyzedFen: fen }),
  clearLines: () => set({ lines: new Map() }),
  updateThreatLine: (line) =>
    set((s) => {
      const next = new Map(s.threatLines);
      next.set(line.multipv, line);
      return { threatLines: next };
    }),
  setThreatAnalyzedFen: (fen) => set({ threatAnalyzedFen: fen }),
  clearThreatLines: () => set({ threatLines: new Map() }),
  resetAll: () =>
    set({ lines: new Map(), analyzedFen: null, threatLines: new Map(), threatAnalyzedFen: null }),
}));
