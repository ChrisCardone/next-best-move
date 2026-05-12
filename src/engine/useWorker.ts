import { useEffect, useRef } from 'react';
import { parseInfo } from './uciParser';
import type { PvLine } from './uciParser';
import { StockfishService } from './stockfish';
import type { InteractiveSettings } from './engineStore';

interface UseWorkerCallbacks {
  /** Called with the FEN the worker is about to analyze — clear or seed state. */
  onAnalyzeStart: (fen: string) => void;
  /** Called for each parsed UCI `info` line with a PV. */
  onPvLine: (line: PvLine) => void;
  /** Called on teardown so consumers can reset their UI state. */
  onTeardown: () => void;
  /** Transform the raw position FEN before sending it to the engine. */
  fenTransform: (fen: string) => string;
}

/**
 * Owns the lifecycle of a single Stockfish worker for a given FEN + settings.
 *
 * Behavior:
 *  - When `active` flips to true, lazy-imports the worker and kicks off
 *    initial analysis at the given FEN.
 *  - Re-runs `analyze()` on FEN/settings changes, debounced 150 ms.
 *  - Tears down the worker when `active` flips to false or the component
 *    unmounts.
 *
 * Designed so the main and threat engines share the same setup code —
 * the only diffs are the `fenTransform` and where parsed lines are routed.
 */
export function useWorker(
  active: boolean,
  fen: string,
  settings: InteractiveSettings,
  callbacks: UseWorkerCallbacks,
): void {
  const { onAnalyzeStart, onPvLine, onTeardown, fenTransform } = callbacks;
  const callbacksRef = useRef({ onAnalyzeStart, onPvLine, onTeardown, fenTransform });
  callbacksRef.current = { onAnalyzeStart, onPvLine, onTeardown, fenTransform };

  const serviceRef = useRef<StockfishService | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Worker lifecycle: spin up when active, tear down otherwise.
  useEffect(() => {
    if (!active) {
      callbacksRef.current.onTeardown();
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      if (cancelled) return;

      const svc = new StockfishService();
      serviceRef.current = svc;

      unsubscribe = svc.onLine((line) => {
        const info = parseInfo(line);
        if (info) callbacksRef.current.onPvLine(info);
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
      // Note: initial analyze is driven by the second effect below — when the
      // service ref becomes non-null, the deps that effect tracks will run.
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      serviceRef.current?.destroy();
      serviceRef.current = null;
      callbacksRef.current.onTeardown();
    };
  }, [active]);

  // Re-analyze on FEN/settings change. The worker may not be ready on the
  // first run; we retry shortly thereafter to catch that case.
  useEffect(() => {
    if (!active) return;

    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      const svc = serviceRef.current;
      if (!svc) {
        // Worker not ready yet — try again shortly. Cleared on teardown.
        debounceRef.current = window.setTimeout(() => {
          const ready = serviceRef.current;
          if (!ready) return;
          const analyzeFen = callbacksRef.current.fenTransform(fen);
          callbacksRef.current.onAnalyzeStart(analyzeFen);
          ready.analyze(analyzeFen, settings.multiPv, settings.depth, settings.hashMb, settings.analyseMode);
        }, 50);
        return;
      }
      const analyzeFen = callbacksRef.current.fenTransform(fen);
      callbacksRef.current.onAnalyzeStart(analyzeFen);
      svc.analyze(analyzeFen, settings.multiPv, settings.depth, settings.hashMb, settings.analyseMode);
    }, 150);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [active, fen, settings.multiPv, settings.depth, settings.hashMb, settings.analyseMode]);
}
