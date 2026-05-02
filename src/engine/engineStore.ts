import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { PvLine } from './uciParser';

interface EngineState {
  enabled: boolean;
  showArrows: boolean;
  threatMode: boolean;
  multipv: number;
  depth: number;
  hashMb: number;
  analyseMode: boolean;
  /** Lines keyed by multipv index (1-based), most recent info per slot. */
  lines: Map<number, PvLine>;
  /** FEN the current `lines` correspond to. */
  analyzedFen: string | null;

  toggle(): void;
  toggleArrows(): void;
  toggleThreatMode(): void;
  setMultiPv(n: number): void;
  setDepth(n: number): void;
  setHashMb(n: number): void;
  setAnalyseMode(b: boolean): void;
  updateLine(line: PvLine): void;
  setAnalyzedFen(fen: string | null): void;
  clearLines(): void;
}

export const useEngineStore = create<EngineState>()(
  persist(
    (set) => ({
      enabled: true,
      showArrows: false,
      threatMode: false,
      multipv: 3,
      depth: 24,
      hashMb: 16,
      analyseMode: true,
      lines: new Map(),
      analyzedFen: null,

      toggle: () =>
        set((s) => {
          const enabled = !s.enabled;
          // Clear lines when turning off.
          return enabled
            ? { enabled }
            : { enabled, lines: new Map(), analyzedFen: null };
        }),

      toggleArrows: () => set((s) => ({ showArrows: !s.showArrows })),
      toggleThreatMode: () => set((s) => ({ threatMode: !s.threatMode })),
      setMultiPv: (n) => set({ multipv: Math.max(1, Math.min(5, n)) }),
      setDepth: (n) => set({ depth: n }),
      setHashMb: (n) => set({ hashMb: n }),
      setAnalyseMode: (b) => set({ analyseMode: b }),
      updateLine: (line) =>
        set((s) => {
          const next = new Map(s.lines);
          next.set(line.multipv, line);
          return { lines: next };
        }),
      setAnalyzedFen: (fen) => set({ analyzedFen: fen }),
      clearLines: () => set({ lines: new Map() }),
    }),
    {
      name: 'nbm-engine-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        showArrows: state.showArrows,
        multipv: state.multipv,
        depth: state.depth,
        hashMb: state.hashMb,
        analyseMode: state.analyseMode,
      }),
    },
  ),
);
