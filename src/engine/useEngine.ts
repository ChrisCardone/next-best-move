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

  const mainServiceRef = useRef<StockfishService | null>(null);
  const threatServiceRef = useRef<StockfishService | null>(null);
  const mainDebounceRef = useRef<number | null>(null);
  const threatDebounceRef = useRef<number | null>(null);
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
      mainServiceRef.current = svc;

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
      useEngineStore.getState().clearLines();
      useEngineStore.getState().setAnalyzedFen(currentFen);
      svc.analyze(currentFen, s.multipv, s.depth, s.hashMb, s.analyseMode);
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      mainServiceRef.current?.destroy();
      mainServiceRef.current = null;
      threatServiceRef.current?.destroy();
      threatServiceRef.current = null;
      useEngineStore.getState().clearLines();
      useEngineStore.getState().setAnalyzedFen(null);
      useEngineStore.getState().clearThreatLines();
      useEngineStore.getState().setThreatAnalyzedFen(null);
    };
  }, [enabled]);

  // Re-analyze main engine on fen / settings change.
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
    const svc = mainServiceRef.current;
    if (!svc) return;

    if (mainDebounceRef.current !== null) {
      window.clearTimeout(mainDebounceRef.current);
    }
    mainDebounceRef.current = window.setTimeout(() => {
      useEngineStore.getState().clearLines();
      useEngineStore.getState().setAnalyzedFen(fen);
      svc.analyze(fen, multipv, depth, hashMb, analyseMode);
    }, 150);

    return () => {
      if (mainDebounceRef.current !== null) {
        window.clearTimeout(mainDebounceRef.current);
        mainDebounceRef.current = null;
      }
    };
  }, [enabled, fen, multipv, depth, hashMb, analyseMode, threatMode]);

  // Threat worker lifecycle: lazy-create only while threat mode is enabled.
  useEffect(() => {
    if (!enabled || !threatMode) {
      if (threatDebounceRef.current !== null) {
        window.clearTimeout(threatDebounceRef.current);
        threatDebounceRef.current = null;
      }
      threatServiceRef.current?.destroy();
      threatServiceRef.current = null;
      useEngineStore.getState().clearThreatLines();
      useEngineStore.getState().setThreatAnalyzedFen(null);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      const { StockfishService } = await import('./stockfish');
      if (cancelled) return;

      const svc = new StockfishService();
      threatServiceRef.current = svc;

      unsubscribe = svc.onLine((line) => {
        const info = parseInfo(line);
        if (info) useEngineStore.getState().updateThreatLine(info);
      });

      try {
        await svc.start();
      } catch (err) {
        console.error('[engine:threat] failed to start:', err);
        return;
      }
      if (cancelled) {
        svc.destroy();
        return;
      }

      const currentFen = useGameStore.getState().currentFen();
      const s = useEngineStore.getState();
      const threatFen = fenForAnalysis(currentFen, true);
      useEngineStore.getState().clearThreatLines();
      useEngineStore.getState().setThreatAnalyzedFen(threatFen);
      svc.analyze(threatFen, s.multipv, s.depth, s.hashMb, s.analyseMode);
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      threatServiceRef.current?.destroy();
      threatServiceRef.current = null;
      useEngineStore.getState().clearThreatLines();
      useEngineStore.getState().setThreatAnalyzedFen(null);
    };
  }, [enabled, threatMode]);

  // Re-analyze threat worker on fen / settings change while threat mode is on.
  useEffect(() => {
    if (!enabled || !threatMode) return;
    const svc = threatServiceRef.current;
    if (!svc) return;

    if (threatDebounceRef.current !== null) {
      window.clearTimeout(threatDebounceRef.current);
    }
    threatDebounceRef.current = window.setTimeout(() => {
      const threatFen = fenForAnalysis(fen, true);
      useEngineStore.getState().clearThreatLines();
      useEngineStore.getState().setThreatAnalyzedFen(threatFen);
      svc.analyze(threatFen, multipv, depth, hashMb, analyseMode);
    }, 150);

    return () => {
      if (threatDebounceRef.current !== null) {
        window.clearTimeout(threatDebounceRef.current);
        threatDebounceRef.current = null;
      }
    };
  }, [enabled, threatMode, fen, multipv, depth, hashMb, analyseMode]);
}
