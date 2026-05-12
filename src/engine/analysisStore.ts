import { create } from 'zustand';
import type { MoveClassification } from './accuracy';

export type { MoveClassification };

/** Evaluation result for a single position on the mainline. Index 0 is the
 *  starting position; there is no move leading to it so `accuracy` and
 *  `classification` are always undefined there. */
export interface PositionEval {
  /** Ply depth (0 = start, 1 = after white's first move, …). */
  ply: number;
  /** SAN of the move that reached this position. Undefined for the root. */
  san?: string;
  /** UCI of the move that reached this position. Undefined for the root. */
  uci?: string;
  /** White's winning chances [0, 100] — 50 = equal. */
  whiteWinPct: number;
  /** Accuracy of the move that led here [0, 100]. Undefined for the root. */
  accuracy?: number;
  /** Lichess-style move classification. Undefined for the root. */
  classification?: MoveClassification;
}

export interface PlayerStats {
  /** Game accuracy [0, 100], harmonic–arithmetic combination per Lichess formula. */
  accuracy: number;
  /** Average centipawn loss. */
  acpl: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
}

export type AnalysisStatus = 'idle' | 'running' | 'complete' | 'cancelled';

interface AnalysisState {
  status: AnalysisStatus;
  /** Index of the position currently being analyzed (0-based). */
  progress: number;
  /** Total positions to analyze. */
  total: number;
  positions: PositionEval[];
  white: PlayerStats | null;
  black: PlayerStats | null;

  setStatus(s: AnalysisStatus): void;
  setProgress(progress: number, total: number): void;
  setPositions(positions: PositionEval[]): void;
  setStats(white: PlayerStats, black: PlayerStats): void;
  reset(): void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  status: 'idle',
  progress: 0,
  total: 0,
  positions: [],
  white: null,
  black: null,

  setStatus: (s) => set({ status: s }),
  setProgress: (progress, total) => set({ progress, total }),
  setPositions: (positions) => set({ positions }),
  setStats: (white, black) => set({ white, black }),
  reset: () =>
    set({ status: 'idle', progress: 0, total: 0, positions: [], white: null, black: null }),
}));
