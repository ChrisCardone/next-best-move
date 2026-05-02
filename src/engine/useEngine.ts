import { useEffect, useRef } from 'react';
import { useGameStore } from '../game/store';
import { useEngineStore } from './engineStore';
import { fenForAnalysis } from './analysisFen';
import { parseInfo } from './uciParser';
import type { StockfishService } from './stockfish';

/**
 * Mounted once at the app root. Owns the lifecycle of the Stockfish worker:
 *   - lazy-imports the service module when the user toggles the engine on
 *   - re-runs analysis whenever the active FEN or multipv changes (debounced)
 *   - tears down the worker when toggled off
 */
export function useEngine(): void {
  const enabled = useEngineStore((s) => s.enabled);
  const multipv = useEngineStore((s) => s.multipv);
  const depth = useEngineStore((s) => s.depth);
  const hashMb = useEngineStore((s) => s.hashMb);
  const analyseMode = useEngineStore((s) => s.analyseMode);
  const threatMode = useEngineStore((s) => s.threatMode);
  const fen = useGameStore((s) => s.currentFen());

  const serviceRef = useRef<StockfishService | null>(null);
  const debounceRef = useRef<number | null>(null);
  const lastFenRef = useRef(fen);

  // Worker lifecycle.
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      // Dynamic import keeps the engine code out of the initial bundle.
      const { StockfishService } = await import('./stockfish');
      if (cancelled) return;

      const svc = new StockfishService();
      serviceRef.current = svc;

      unsubscribe = svc.onLine((line) => {
        const info = parseInfo(line);
        if (info) useEngineStore.getState().updateLine(info);
      });

      try {
        await svc.start();
      } catch (err) {
        console.error('[engine] failed to start:', err);
        return;
      }
      if (cancelled) {
        svc.destroy();
        return;
      }

      // Kick off initial analysis.
      const currentFen = useGameStore.getState().currentFen();
      const s = useEngineStore.getState();
      const effectiveFen = fenForAnalysis(currentFen, s.threatMode);
      useEngineStore.getState().clearLines();
      useEngineStore.getState().setAnalyzedFen(effectiveFen);
      svc.analyze(effectiveFen, s.multipv, s.depth, s.hashMb, s.analyseMode);
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      serviceRef.current?.destroy();
      serviceRef.current = null;
      useEngineStore.getState().clearLines();
      useEngineStore.getState().setAnalyzedFen(null);
    };
  }, [enabled]);

  // Re-analyze on fen / multipv change. Debounced to avoid thrashing during
  // rapid keyboard navigation.
  useEffect(() => {
    const fenChanged = lastFenRef.current !== fen;
    if (fenChanged) {
      lastFenRef.current = fen;
      if (threatMode) {
        useEngineStore.getState().toggleThreatMode();
        return;
      }
    }

    if (!enabled) return;
    const svc = serviceRef.current;
    if (!svc) return;

    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      const effectiveFen = fenForAnalysis(fen, threatMode);
      useEngineStore.getState().clearLines();
      useEngineStore.getState().setAnalyzedFen(effectiveFen);
      svc.analyze(effectiveFen, multipv, depth, hashMb, analyseMode);
    }, 150);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [enabled, fen, multipv, depth, hashMb, analyseMode, threatMode]);
}
