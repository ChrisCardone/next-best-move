import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Speed, RatingBucket } from './lichessExplorer';
import type { ExplorerSource } from './useExplorer';

interface ExplorerState {
  source: ExplorerSource;
  speeds: Speed[];
  ratings: RatingBucket[];
  showBestMoveArrow: boolean;
  bestMoveFen: string | null;
  bestMoveUci: string | null;
  minPopularity: number;
  setSource: (source: ExplorerSource) => void;
  toggleSpeed: (speed: Speed) => void;
  toggleRating: (rating: RatingBucket) => void;
  toggleBestMoveArrow: () => void;
  setBestMoveCandidate: (fen: string | null, uci: string | null) => void;
  setMinPopularity: (pct: number) => void;
}

export const useExplorerStore = create<ExplorerState>()(
  persist(
    (set, get) => ({
      source: 'lichess',
      speeds: ['blitz', 'rapid', 'classical'],
      ratings: [1200, 1400, 1600, 1800, 2000],
      showBestMoveArrow: false,
      bestMoveFen: null,
      bestMoveUci: null,
      minPopularity: 5,

      setSource: (source) => set({ source }),

      toggleSpeed: (speed) => {
        const { speeds } = get();
        const next = speeds.includes(speed)
          ? speeds.filter((s) => s !== speed)
          : [...speeds, speed];
        if (next.length > 0) set({ speeds: next });
      },

      toggleRating: (rating) => {
        const { ratings } = get();
        const next = ratings.includes(rating)
          ? ratings.filter((r) => r !== rating)
          : [...ratings, rating];
        if (next.length > 0) set({ ratings: next });
      },

      toggleBestMoveArrow: () => set((s) => ({ showBestMoveArrow: !s.showBestMoveArrow })),

      setBestMoveCandidate: (fen, uci) => set({ bestMoveFen: fen, bestMoveUci: uci }),

      setMinPopularity: (pct) => set({ minPopularity: Math.max(1, Math.min(50, pct)) }),
    }),
    {
      name: 'nbm-explorer-settings',
      partialize: (state) => ({
        source: state.source,
        speeds: state.speeds,
        ratings: state.ratings,
        showBestMoveArrow: state.showBestMoveArrow,
        minPopularity: state.minPopularity,
      }),
    },
  ),
);
