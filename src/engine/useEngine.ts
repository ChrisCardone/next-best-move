import { useEffect, useRef } from 'react';
import { useGameStore } from '../game/store';
import { useEngineStore } from './engineStore';
import { useEnginePvStore } from './enginePvStore';
import { fenForAnalysis } from './analysisFen';
import { useWorker } from './useWorker';

/**
 * Mounted once at the app root. Drives two Stockfish workers via `useWorker`:
 *   - the "main" worker (always live while the engine is enabled)
 *   - the "threat" worker (only while threat mode is on)
 *
 * The store split keeps persisted user settings (`useEngineStore`) separate
 * from the live PV state (`useEnginePvStore`).
 */
export function useEngine(): void {
  const enabled = useEngineStore((s) => s.enabled);
  const interactive = useEngineStore((s) => s.interactive);
  const threatMode = useEngineStore((s) => s.threatMode);
  const fen = useGameStore((s) => s.currentFen());

  // Auto-disable threat mode when the position changes — the threat eval
  // tied to the previous position is no longer meaningful.
  const lastFenRef = useRef(fen);
  useEffect(() => {
    if (lastFenRef.current !== fen) {
      lastFenRef.current = fen;
      if (threatMode) useEngineStore.getState().toggleThreatMode();
    }
  }, [fen, threatMode]);

  // Main engine.
  useWorker(enabled, fen, interactive, {
    onAnalyzeStart: (analyzeFen) => {
      useEnginePvStore.getState().clearLines();
      useEnginePvStore.getState().setAnalyzedFen(analyzeFen);
    },
    onPvLine: (line) => useEnginePvStore.getState().updateLine(line),
    onTeardown: () => {
      useEnginePvStore.getState().clearLines();
      useEnginePvStore.getState().setAnalyzedFen(null);
    },
    fenTransform: (f) => f,
  });

  // Threat engine — only while threat mode is enabled.
  useWorker(enabled && threatMode, fen, interactive, {
    onAnalyzeStart: (analyzeFen) => {
      useEnginePvStore.getState().clearThreatLines();
      useEnginePvStore.getState().setThreatAnalyzedFen(analyzeFen);
    },
    onPvLine: (line) => useEnginePvStore.getState().updateThreatLine(line),
    onTeardown: () => {
      useEnginePvStore.getState().clearThreatLines();
      useEnginePvStore.getState().setThreatAnalyzedFen(null);
    },
    fenTransform: (f) => fenForAnalysis(f, true),
  });
}
