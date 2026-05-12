import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Search settings used for interactive engine analysis (the live PV panel). */
export interface InteractiveSettings {
  multiPv: number;
  depth: number;
  hashMb: number;
  analyseMode: boolean;
}

/** Search settings used for the full-game Run Analysis pass. */
export interface FullGameSettings {
  multiPv: number;
  /** Depth ceiling when `limitKind === 'depth'`. */
  depth: number;
  /** Nodes ceiling when `limitKind === 'nodes'`. Lichess fishnet uses 1.5M. */
  nodes: number;
  /** How to bound each per-position search. Node-limited matches Lichess. */
  limitKind: 'depth' | 'nodes';
  hashMb: number;
  /**
   * When true, query Lichess's cloud-eval cache before running local
   * Stockfish on each position. Misses fall back to local search.
   */
  useCloudEval: boolean;
}

interface EngineState {
  enabled: boolean;
  showArrows: boolean;
  threatMode: boolean;
  interactive: InteractiveSettings;
  fullGame: FullGameSettings;

  toggle(): void;
  toggleArrows(): void;
  toggleThreatMode(): void;
  setInteractive<K extends keyof InteractiveSettings>(key: K, value: InteractiveSettings[K]): void;
  setFullGame<K extends keyof FullGameSettings>(key: K, value: FullGameSettings[K]): void;
}

const INTERACTIVE_DEFAULTS: InteractiveSettings = {
  multiPv: 3,
  depth: 24,
  hashMb: 64,
  analyseMode: true,
};

const FULL_GAME_DEFAULTS: FullGameSettings = {
  multiPv: 1,
  depth: 20,
  nodes: 1_500_000,
  limitKind: 'nodes',
  hashMb: 64,
  useCloudEval: true,
};

function clampMultiPv(n: number): number {
  return Math.max(1, Math.min(5, n));
}

export const useEngineStore = create<EngineState>()(
  persist(
    (set) => ({
      enabled: true,
      showArrows: false,
      threatMode: false,
      interactive: INTERACTIVE_DEFAULTS,
      fullGame: FULL_GAME_DEFAULTS,

      toggle: () => set((s) => ({ enabled: !s.enabled })),
      toggleArrows: () => set((s) => ({ showArrows: !s.showArrows })),
      toggleThreatMode: () => set((s) => ({ threatMode: !s.threatMode })),
      setInteractive: (key, value) =>
        set((s) => ({
          interactive: {
            ...s.interactive,
            [key]: key === 'multiPv' ? clampMultiPv(value as number) : value,
          },
        })),
      setFullGame: (key, value) =>
        set((s) => ({
          fullGame: {
            ...s.fullGame,
            [key]: key === 'multiPv' ? clampMultiPv(value as number) : value,
          },
        })),
    }),
    {
      name: 'nbm-engine-settings',
      version: 6,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        showArrows: state.showArrows,
        interactive: state.interactive,
        fullGame: state.fullGame,
      }),
      // After migrate runs, deep-merge defaults into the nested setting
      // buckets so any field added in a later release is backfilled even if
      // the migration path missed it (e.g. a user persisted at v4 without
      // limitKind, then re-opened on v5 — `if (version >= 4) return
      // persisted` would pass that incomplete shape through verbatim).
      merge: (persisted, current) => {
        const p = (persisted as Partial<EngineState> | null | undefined) ?? {};
        return {
          ...current,
          ...p,
          interactive: { ...current.interactive, ...(p.interactive ?? {}) },
          fullGame: { ...current.fullGame, ...(p.fullGame ?? {}) },
        };
      },
      migrate: (persisted, version) => {
        if (version >= 6) return persisted as Partial<EngineState>;
        if (version === 4 || version === 5) {
          // v4/v5 → v6: previous migrations left some users without a
          // `limitKind` field (the v4 short-circuit returned persisted state
          // verbatim). Force-reset nodes + limitKind to the defaults so
          // everyone gets Lichess-parity fishnet settings.
          const old = persisted as Partial<EngineState> | null | undefined;
          if (!old) return undefined;
          const fullGame = old.fullGame ?? FULL_GAME_DEFAULTS;
          return {
            ...old,
            fullGame: {
              ...fullGame,
              nodes: FULL_GAME_DEFAULTS.nodes,
              limitKind: FULL_GAME_DEFAULTS.limitKind,
              useCloudEval: FULL_GAME_DEFAULTS.useCloudEval,
            },
          };
        }
        if (version === 3) {
          // v3 → v4: introduce nodes-limited search for the full-game pass,
          // and force cloud-eval on (the v3 flag default was false, but for
          // accuracy parity with Lichess we want everyone on the cache by
          // default — users who don't want it can re-disable).
          const v3 = persisted as Partial<EngineState> | null | undefined;
          if (!v3) return undefined;
          const fullGame = v3.fullGame ?? FULL_GAME_DEFAULTS;
          return {
            ...v3,
            fullGame: {
              ...fullGame,
              nodes: (fullGame as Partial<FullGameSettings>).nodes ?? FULL_GAME_DEFAULTS.nodes,
              limitKind: (fullGame as Partial<FullGameSettings>).limitKind ?? FULL_GAME_DEFAULTS.limitKind,
              useCloudEval: FULL_GAME_DEFAULTS.useCloudEval,
            },
          };
        }
        if (version === 2) {
          // Bump v2 → v3: only the bundled defaults changed. If the user is on
          // the old defaults exactly, slide them up to the new ones; otherwise
          // respect their customised values.
          const v2 = persisted as Partial<EngineState> | null | undefined;
          if (!v2) return undefined;
          const interactive = v2.interactive ?? INTERACTIVE_DEFAULTS;
          const fullGame = v2.fullGame ?? FULL_GAME_DEFAULTS;
          return {
            ...v2,
            interactive: interactive.hashMb === 16
              ? { ...interactive, hashMb: 64 }
              : interactive,
            fullGame: {
              ...fullGame,
              depth: fullGame.depth === 18 ? 20 : fullGame.depth,
              nodes: FULL_GAME_DEFAULTS.nodes,
              limitKind: FULL_GAME_DEFAULTS.limitKind,
              useCloudEval: FULL_GAME_DEFAULTS.useCloudEval,
            },
          };
        }
        // Version 1 used flat fields. Translate to nested shape.
        const old = persisted as Record<string, unknown> | null | undefined;
        if (!old) return undefined;
        return {
          enabled: typeof old.enabled === 'boolean' ? old.enabled : true,
          showArrows: typeof old.showArrows === 'boolean' ? old.showArrows : false,
          interactive: {
            multiPv: clampMultiPv(typeof old.multipv === 'number' ? old.multipv : INTERACTIVE_DEFAULTS.multiPv),
            depth: typeof old.depth === 'number' ? old.depth : INTERACTIVE_DEFAULTS.depth,
            hashMb: typeof old.hashMb === 'number' ? old.hashMb : INTERACTIVE_DEFAULTS.hashMb,
            analyseMode: typeof old.analyseMode === 'boolean' ? old.analyseMode : INTERACTIVE_DEFAULTS.analyseMode,
          },
          fullGame: {
            multiPv: clampMultiPv(typeof old.analysisMultiPv === 'number' ? old.analysisMultiPv : FULL_GAME_DEFAULTS.multiPv),
            depth: typeof old.analysisDepth === 'number' ? old.analysisDepth : FULL_GAME_DEFAULTS.depth,
            nodes: FULL_GAME_DEFAULTS.nodes,
            limitKind: FULL_GAME_DEFAULTS.limitKind,
            hashMb: typeof old.analysisHashMb === 'number' ? old.analysisHashMb : FULL_GAME_DEFAULTS.hashMb,
            useCloudEval: FULL_GAME_DEFAULTS.useCloudEval,
          },
        } as Partial<EngineState>;
      },
    },
  ),
);
