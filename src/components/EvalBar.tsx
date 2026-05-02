import { useEffect, useState } from 'react';
import { useEngineStore } from '../engine/engineStore';
import { fenForAnalysis } from '../engine/analysisFen';
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
  const threatMode = useEngineStore((s) => s.threatMode);
  const analyzedFen = useEngineStore((s) => s.analyzedFen);
  const fen = useGameStore((s) => s.currentFen());
  const position = useGameStore((s) => s.currentPosition());
  const [lastEval, setLastEval] = useState<EvalSnapshot | null>(null);

  const pv1 = lines.get(1);
  const expectedFen = fenForAnalysis(fen, threatMode);
  const isCurrentAnalysis = analyzedFen === expectedFen;
  const whiteToMove = expectedFen.split(' ')[1] === 'w';
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

  return (
    <div className="evalbar" aria-label="Engine evaluation">
      <div className="evalbar__white" style={{ height: whiteHeight }} />
      {enabled && label && (
        <span
          className={`evalbar__label ${pct >= 50 ? 'evalbar__label--bottom' : 'evalbar__label--top'}`}
        >
          {label}
        </span>
      )}
    </div>
  );
}
