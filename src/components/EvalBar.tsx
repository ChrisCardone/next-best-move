import { useEffect, useState } from 'react';
import { useEngineStore } from '../engine/engineStore';
import { useGameStore } from '../game/store';
import { whiteCp, formatScore } from '../engine/uciParser';

interface EvalSnapshot {
  pct: number;
  label: string;
}

/**
 * Vertical bar showing the engine's evaluation from white's perspective.
 * Reads PV1 from the engine store.
 */
export function EvalBar() {
  const enabled = useEngineStore((s) => s.enabled);
  const lines = useEngineStore((s) => s.lines);
  const analyzedFen = useEngineStore((s) => s.analyzedFen);
  const fen = useGameStore((s) => s.currentFen());
  const position = useGameStore((s) => s.currentPosition());
  const orientation = useGameStore((s) => s.orientation);
  const [lastEval, setLastEval] = useState<EvalSnapshot | null>(null);

  const pv1 = lines.get(1);
  const isCurrentAnalysis = analyzedFen === fen;
  const whiteToMove = fen.split(' ')[1] === 'w';
  const outcome = position.outcome();

  let nextEval: EvalSnapshot | null = null;
  if (outcome) {
    nextEval = outcome.winner === 'white'
      ? { pct: 100, label: 'M0' }
      : outcome.winner === 'black'
        ? { pct: 0, label: '-M0' }
        : { pct: 50, label: '0.00' };
  } else if (enabled && isCurrentAnalysis && pv1) {
    const cp = whiteCp(pv1, whiteToMove);
    // Sigmoid-ish curve so small advantages aren't dramatic but mate is decisive.
    nextEval = {
      pct: 50 + 50 * Math.tanh(cp / 400),
      label: formatScore(pv1, whiteToMove),
    };
  }

  useEffect(() => {
    if (!enabled) {
      setLastEval(null);
      return;
    }
    if (nextEval) {
      setLastEval((prev) => {
        if (prev?.pct === nextEval?.pct && prev.label === nextEval.label) return prev;
        return nextEval;
      });
    }
  }, [enabled, nextEval?.pct, nextEval?.label]);

  const displayEval = nextEval ?? lastEval;
  const pct = displayEval?.pct ?? 50;
  const label = displayEval?.label ?? '';

  const whiteHeight = `${pct}%`;
  const whiteStyle = orientation === 'black'
    ? { height: whiteHeight, top: 0, bottom: 'auto' as const }
    : { height: whiteHeight };
  const labelPositionClass = orientation === 'black'
    ? 'evalbar__label--top'
    : pct >= 50
      ? 'evalbar__label--bottom'
      : 'evalbar__label--top';
  const labelToneClass = orientation === 'black'
    ? pct >= 50
      ? 'evalbar__label--dark'
      : 'evalbar__label--light'
    : pct >= 50
      ? 'evalbar__label--dark'
      : 'evalbar__label--light';

  return (
    <div className="evalbar" aria-label="Engine evaluation">
      <div className="evalbar__white" style={whiteStyle} />
      {enabled && label && (
        <span
          className={`evalbar__label ${labelPositionClass} ${labelToneClass}`}
        >
          {label}
        </span>
      )}
    </div>
  );
}
