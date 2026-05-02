import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { uciToMove } from '@lichess-org/chessground/util';
import type { PvBoard } from '../engine/pvToSan';

interface Props {
  /** All board states for the hovered PV line. */
  boards: PvBoard[];
  /** Index within `boards` to display. */
  index: number;
  /**
   * Identifier for the PV line (e.g. multipv number). When this changes the
   * board hard-resets rather than trying to animate from the previous line.
   */
  lineKey: number;
  orientation: 'white' | 'black';
  style?: CSSProperties;
}

interface PrevState {
  lineKey: number;
  index: number;
}

/**
 * A small read-only Chessground board that previews a position in a PV line.
 *
 * For sequential forward moves within the same line it calls `api.move()` so
 * Chessground animates the piece. For any other transition (line change,
 * backward jump, promotion) it falls back to `api.set({ fen })`.
 */
export function PvMiniBoard({ boards, index, lineKey, orientation, style }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<CgApi | null>(null);
  const prevRef = useRef<PrevState | null>(null);

  // One-time init: create Chessground with the initial position.
  useEffect(() => {
    if (!containerRef.current) return;

    const board = boards[index];
    const api = Chessground(containerRef.current, {
      fen: board?.fen,
      lastMove: board?.uci ? uciToMove(board.uci) : undefined,
      orientation,
      viewOnly: true,
      coordinates: false,
      animation: { enabled: true, duration: 150 },
      highlight: { lastMove: true, check: false },
      drawable: { enabled: false, visible: false },
    });
    apiRef.current = api;
    prevRef.current = { lineKey, index };

    const ro = new ResizeObserver(() => api.redrawAll());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      api.destroy();
      apiRef.current = null;
      prevRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update the board when index / lineKey / orientation change.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;

    const board = boards[index];
    if (!board) return;

    const prev = prevRef.current;
    const isSequentialForward =
      prev !== null &&
      prev.lineKey === lineKey &&
      prev.index === index - 1 &&
      board.uci.length === 4; // exclude promotions (length 5) — set() handles those

    if (isSequentialForward) {
      // Animate the piece sliding to its destination.
      api.move(board.uci.slice(0, 2) as Key, board.uci.slice(2, 4) as Key);
    } else {
      // Hard reset: different line, backward step, jump, or promotion.
      api.set({ fen: board.fen, lastMove: board.uci ? uciToMove(board.uci) : undefined, orientation });
    }

    prevRef.current = { lineKey, index };
  }, [boards, index, lineKey, orientation]);

  return (
    <div className="engine__pv-board" style={style}>
      <div ref={containerRef} className="cg-wrap lichess-brown" />
    </div>
  );
}
