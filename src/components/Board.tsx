import { useEffect, useMemo, useRef } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Config as CgConfig } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import type { DrawBrush, DrawBrushes, DrawShape } from '@lichess-org/chessground/draw';
import {
  legalDests,
  turnColor,
  lastMoveSquares,
  checkColor,
  parseSquare,
  makeUci,
  makeFen,
} from '../game/chess';
import type { NormalMove } from '../game/chess';
import { useGameStore } from '../game/store';
import { useEngineStore } from '../engine/engineStore';
import { fenForAnalysis } from '../engine/analysisFen';
import { useExplorerStore } from '../explorer/explorerStore';
import { isOnMainline } from '../game/tree';

function evalScore(line: { scoreCp?: number; mate?: number }): number {
  if (line.mate !== undefined) {
    if (line.mate > 0) return 1000;
    if (line.mate < 0) return -1000;
    return 0;
  }
  return line.scoreCp ?? 0;
}

function relativeOpacity(
  score: number,
  min: number,
  max: number,
): number {
  if (max <= min) return 0.58;

  const normalized = (score - min) / (max - min);
  const spread = max - min;

  // Larger eval spread means we can separate the arrows more aggressively.
  // Small spread keeps opacities clustered so near-equal moves look similar.
  const contrast = Math.min(1, spread / 250);
  const centerOpacity = 0.58;
  const maxDelta = 0.27 * contrast;
  const offset = (normalized - 0.5) * 2;
  const opacity = centerOpacity + offset * maxDelta;

  return Math.max(0.25, Math.min(0.85, opacity));
}

function buildArrowOverlay(
  lines: Array<{ multipv: number; pv: string[]; scoreCp?: number; mate?: number }>,
  color: string,
  prefix: string,
): { shapes: DrawShape[]; brushes: Record<string, DrawBrush> } {
  const scores = lines.map(evalScore);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const shapes: DrawShape[] = [];
  const brushes: Record<string, DrawBrush> = {};

  lines.forEach((line, idx) => {
    const uci = line.pv?.[0];
    if (!uci || uci.length < 4) return;

    const brushName = `${prefix}${idx}`;
    brushes[brushName] = {
      key: `${prefix}${idx}`,
      color,
      opacity: relativeOpacity(evalScore(line), min, max),
      lineWidth: 15,
    };
    shapes.push({
      orig: uci.slice(0, 2) as Key,
      dest: uci.slice(2, 4) as Key,
      brush: brushName,
    });
  });

  return { shapes, brushes };
}

/**
 * Chessground board, driven by the Zustand store.
 *
 * The store is the single source of truth: when path or root change,
 * the chessground API is reconfigured to reflect the derived position.
 * User moves are reported back to the store via `playUci`.
 */
export function Board() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<CgApi | null>(null);

  const root = useGameStore((s) => s.root);
  const path = useGameStore((s) => s.path);
  const orientation = useGameStore((s) => s.orientation);
  const playUci = useGameStore((s) => s.playUci);
  const inVariation = !isOnMainline(root, path);

  // Engine arrows: top PV's first move drawn as a faint arrow on the board.
  const engineEnabled = useEngineStore((s) => s.enabled);
  const showArrows = useEngineStore((s) => s.showArrows);
  const threatMode = useEngineStore((s) => s.threatMode);
  const engineLines = useEngineStore((s) => s.lines);
  const analyzedFen = useEngineStore((s) => s.analyzedFen);
  const currentFen = useGameStore((s) => s.currentFen());
  const showBestMoveArrow = useExplorerStore((s) => s.showBestMoveArrow);
  const bestMoveFen = useExplorerStore((s) => s.bestMoveFen);
  const bestMoveUci = useExplorerStore((s) => s.bestMoveUci);

  const arrowOverlay = useMemo<{ shapes: DrawShape[]; brushes: Record<string, DrawBrush> }>(() => {
    if (!engineEnabled) return { shapes: [], brushes: {} };
    if (!threatMode && !showArrows) return { shapes: [], brushes: {} };
    const expectedFen = fenForAnalysis(currentFen, threatMode);
    if (!analyzedFen || analyzedFen !== expectedFen) return { shapes: [], brushes: {} };
    const sorted = Array.from(engineLines.values()).sort(
      (a, b) => a.multipv - b.multipv,
    );
    const topLines = sorted.slice(0, 3);

    if (topLines.length === 0) return { shapes: [], brushes: {} };

    return threatMode
      ? buildArrowOverlay(topLines, '#882020', 'threatArrow')
      : buildArrowOverlay(topLines, '#003088', 'engineArrow');
  }, [engineEnabled, showArrows, threatMode, engineLines, analyzedFen, currentFen]);

  const explorerOverlay = useMemo<{ shapes: DrawShape[]; brushes: Record<string, DrawBrush> }>(() => {
    if (!showBestMoveArrow) return { shapes: [], brushes: {} as Record<string, DrawBrush> };
    if (!bestMoveUci || bestMoveUci.length < 4) return { shapes: [], brushes: {} as Record<string, DrawBrush> };
    if (bestMoveFen !== currentFen) return { shapes: [], brushes: {} as Record<string, DrawBrush> };

    return {
      shapes: [
        {
          orig: bestMoveUci.slice(0, 2) as Key,
          dest: bestMoveUci.slice(2, 4) as Key,
          brush: 'explorerBestMove',
        },
      ],
      brushes: {
        explorerBestMove: {
          key: 'explorerBestMove',
          color: '#c99a00',
          opacity: 0.9,
          lineWidth: 16,
        },
      },
    };
  }, [showBestMoveArrow, bestMoveUci, bestMoveFen, currentFen]);

  const mergedOverlay = useMemo<{ shapes: DrawShape[]; brushes: Record<string, DrawBrush> }>(
    () => ({
      shapes: [...arrowOverlay.shapes, ...explorerOverlay.shapes],
      brushes: { ...arrowOverlay.brushes, ...explorerOverlay.brushes },
    }),
    [arrowOverlay, explorerOverlay],
  );

  // One-time chessground init.
  useEffect(() => {
    if (!containerRef.current) return;

    const config: CgConfig = {
      orientation,
      animation: { enabled: true, duration: 200 },
      highlight: { lastMove: true, check: true },
      drawable: {
        enabled: true,
        visible: true,
      },
      movable: {
        free: false,
        showDests: true,
      },
      events: {
        move: (orig: Key, dest: Key) => {
          handleUserMove(orig, dest);
        },
      },
    };

    const api = Chessground(containerRef.current, config);
    apiRef.current = api;

    // Chessground caches piece positions in pixel coords on init and on
    // each `set()`. When the container resizes (responsive layouts, window
    // resize, fonts loading, etc.) those coords go stale and pieces render
    // offset/half-clipped. ResizeObserver -> redrawAll fixes that.
    const ro = new ResizeObserver(() => {
      apiRef.current?.redrawAll();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      api.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync chessground to the current store state.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const pos = useGameStore.getState().currentPosition();
    const lastUci = useGameStore.getState().lastUci();
    api.set({
      fen: makeFen(pos.toSetup()),
      orientation,
      turnColor: turnColor(pos),
      lastMove: lastMoveSquares(lastUci),
      check: checkColor(pos),
      movable: {
        color: turnColor(pos),
        dests: legalDests(pos),
        free: false,
      },
    });
  }, [root, path, orientation]);

  // Apply engine arrows whenever the top PV changes.
  useEffect(() => {
    apiRef.current?.set({
      drawable: {
        autoShapes: mergedOverlay.shapes,
        brushes: mergedOverlay.brushes as DrawBrushes,
      },
    });
  }, [mergedOverlay]);

  const handleUserMove = (orig: Key, dest: Key) => {
    const pos = useGameStore.getState().currentPosition();
    const from = parseSquare(orig);
    const to = parseSquare(dest);
    if (from === undefined || to === undefined) return;

    const piece = pos.board.get(from);
    const isPromotion =
      piece?.role === 'pawn' &&
      ((piece.color === 'white' && to >= 56) || (piece.color === 'black' && to <= 7));

    const move: NormalMove = isPromotion
      ? { from, to, promotion: 'queen' }
      : { from, to };

    if (!pos.isLegal(move)) return;
    playUci(makeUci(move));
  };

  return (
    <div className={`board-wrap${inVariation ? ' board-wrap--variation' : ''}`}>
      <div ref={containerRef} className="cg-wrap lichess-brown" />
    </div>
  );
}
