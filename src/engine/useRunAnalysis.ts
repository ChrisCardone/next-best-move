import { useEffect } from 'react';
import { mainlinePath, nodesOnPath } from '../game/tree';
import { useGameStore } from '../game/store';
import { useEngineStore } from './engineStore';
import { useAnalysisStore } from './analysisStore';
import type { PositionEval, PlayerStats, MoveClassification } from './analysisStore';
import { parseInfo } from './uciParser';
import type { StockfishService } from './stockfish';

interface EngineScore {
  cp?: number;
  mate?: number;
}

const INITIAL_CP = 15;

// ---------------------------------------------------------------------------
// Lichess accuracy formulas
// Ref: https://lichess.org/page/accuracy
//      lila AccuracyPercent.scala / AccuracyCP.scala
// ---------------------------------------------------------------------------

/**
 * Win% for the side to move, given centipawns (positive = side to move is winning).
 * Returns a value in [0, 100].
 */
function winPercent(cp: number): number {
  return 100 / (1 + Math.exp(-0.00368208 * cp));
}

/** Lichess winning chances in [-1, 1]. */
function winningChances(cp: number): number {
  return Math.max(-1, Math.min(1, 2 / (1 + Math.exp(-0.00368208 * cp)) - 1));
}

/**
 * White's winning chances [0, 100], given the UCI engine eval and whose turn it is.
 * UCI always reports eval from the side-to-move perspective.
 */
function whiteWinPct(cp: number, whiteToMove: boolean): number {
  return whiteToMove ? winPercent(cp) : 100 - winPercent(cp);
}

/**
 * Accuracy of a single move, given the drop in win% for the side that moved.
 * `dropPct` is in percentage points [0, 100].
 * Formula: 103.1668 × e^(−0.04354 × drop) − 3.1669, clamped [0, 100].
 */
function moveAccuracy(dropPct: number): number {
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * Math.max(0, dropPct)) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}

/** Lichess move classification thresholds (in percentage-point win-chance drop). */
function classifyChanceDrop(drop: number): MoveClassification {
  if (drop >= 0.3) return 'blunder';
  if (drop >= 0.2) return 'mistake';
  if (drop >= 0.1) return 'inaccuracy';
  return 'good';
}

/**
 * Standard deviation for a window of win percentages.
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function weightedMean(values: Array<{ value: number; weight: number }>): number | null {
  if (values.length === 0) return null;
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function harmonicMean(values: number[]): number | null {
  if (values.length === 0) return null;
  const denom = values.reduce((sum, value) => sum + 1 / Math.max(value, 1e-9), 0);
  if (denom <= 0) return null;
  return values.length / denom;
}

/**
 * Lichess-style game accuracy: average of volatility-weighted mean and harmonic mean.
 */
function gameAccuracyByColor(
  moveAccuracies: Array<{ color: 'white' | 'black'; accuracy: number }>,
  sideToMoveWinPercents: number[],
): { white: number; black: number } {
  const moveCount = moveAccuracies.length;
  const windowSize = Math.max(2, Math.min(8, Math.floor(moveCount / 10)));
  const effectiveWindowSize = Math.min(windowSize, sideToMoveWinPercents.length);

  const windows: number[][] = [];
  for (let i = 0; i < Math.max(0, effectiveWindowSize - 2); i += 1) {
    windows.push(sideToMoveWinPercents.slice(0, effectiveWindowSize));
  }
  for (let i = 0; i + effectiveWindowSize <= sideToMoveWinPercents.length; i += 1) {
    windows.push(sideToMoveWinPercents.slice(i, i + effectiveWindowSize));
  }

  const weights = windows.map((xs) => Math.max(0.5, Math.min(12, standardDeviation(xs) || 0)));
  const weightedAccuracies = moveAccuracies.map((move, index) => ({
    color: move.color,
    accuracy: move.accuracy,
    weight: weights[index] ?? 0.5,
  }));

  const byColor = (color: 'white' | 'black'): number => {
    const entries = weightedAccuracies.filter((entry) => entry.color === color);
    const weighted = weightedMean(entries.map((entry) => ({ value: entry.accuracy, weight: entry.weight })));
    const harmonic = harmonicMean(entries.map((entry) => entry.accuracy));
    if (weighted === null || harmonic === null) return 0;
    return (weighted + harmonic) / 2;
  };

  return {
    white: byColor('white'),
    black: byColor('black'),
  };
}

/** Clamp cp to ±1000 (treating mate as ±1000) for numeric calculations. */
function clampCp(cp: number | undefined, mate: number | undefined): number {
  if (mate !== undefined) return mate > 0 ? 1000 : -1000;
  return Math.max(-1000, Math.min(1000, cp ?? 0));
}

function invertScore(score: EngineScore): EngineScore {
  return {
    cp: score.cp !== undefined ? -score.cp : undefined,
    mate: score.mate !== undefined ? -score.mate : undefined,
  };
}

function scoreToWhiteWinPct(score: EngineScore, whiteToMove: boolean): number {
  const cp = clampCp(score.cp, score.mate);
  return whiteWinPct(cp, whiteToMove);
}

function scoreToWinPercent(score: EngineScore): number {
  return winPercent(clampCp(score.cp, score.mate));
}

function scoreToWinningChances(score: EngineScore): number {
  return winningChances(clampCp(score.cp, score.mate));
}

function classifyMoveLikeLichess(before: EngineScore, after: EngineScore): MoveClassification {
  const beforeIsMate = before.mate !== undefined;
  const afterIsMate = after.mate !== undefined;

  if (!beforeIsMate && afterIsMate && (after.mate ?? 0) < 0) {
    const prevPovCpOrZero = before.cp ?? 0;
    if (prevPovCpOrZero < -999) return 'inaccuracy';
    if (prevPovCpOrZero < -700) return 'mistake';
    return 'blunder';
  }

  if (beforeIsMate && (before.mate ?? 0) > 0 && !afterIsMate) {
    const povCpOrZero = after.cp ?? 0;
    if (povCpOrZero > 999) return 'inaccuracy';
    if (povCpOrZero > 700) return 'mistake';
    return 'blunder';
  }

  if (beforeIsMate && (before.mate ?? 0) > 0 && afterIsMate && (after.mate ?? 0) < 0) {
    return 'blunder';
  }

  if (!beforeIsMate && !afterIsMate) {
    const drop = scoreToWinningChances(before) - scoreToWinningChances(after);
    return classifyChanceDrop(Math.max(0, drop));
  }

  return 'good';
}

// ---------------------------------------------------------------------------
// Worker singleton — lives only for the duration of a single analysis run
// ---------------------------------------------------------------------------

let _worker: StockfishService | null = null;
let _cancelled = false;

/**
 * Analyze a single position and resolve with its best-line eval.
 * Subscribes to the worker's output, waits for `bestmove`, then unsubscribes.
 */
function analyzePosition(
  svc: StockfishService,
  fen: string,
  multipv: number,
  depth: number,
  hashMb: number,
): Promise<EngineScore | null> {
  return new Promise((resolve) => {
    let best: EngineScore | null = null;
    let done = false;

    const unsub = svc.onLine((line) => {
      if (done) return;
      const info = parseInfo(line);
      if (info?.multipv === 1) {
        best = { cp: info.scoreCp, mate: info.mate };
      }
      if (line.startsWith('bestmove')) {
        done = true;
        unsub();
        resolve(best);
      }
    });

    svc.analyze(fen, multipv, depth, hashMb, true);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function startRunAnalysis(): Promise<void> {
  const store = useAnalysisStore.getState();
  if (store.status === 'running') return;

  _cancelled = false;
  _worker?.destroy();
  _worker = null;

  store.reset();
  store.setStatus('running');

  // Collect mainline nodes from the current game tree.
  const { root } = useGameStore.getState();
  const mainPath = mainlinePath(root);
  const nodes = nodesOnPath(root, mainPath); // [rootNode, move1Node, …]

  if (nodes.length < 2) {
    // No moves to analyze.
    store.setStatus('complete');
    return;
  }

  // Pull dedicated Run Analysis settings from the engine store.
  const { analysisMultiPv, analysisDepth, analysisHashMb } = useEngineStore.getState();
  const total = nodes.length;
  store.setProgress(0, total);

  // Spin up a dedicated worker.
  const { StockfishService } = await import('./stockfish');
  if (_cancelled) { store.setStatus('cancelled'); return; }

  _worker = new StockfishService();
  try {
    await _worker.start();
  } catch (err) {
    console.error('[analysis] worker failed to start:', err);
    _worker?.destroy();
    _worker = null;
    store.setStatus('idle');
    return;
  }
  if (_cancelled) { _worker.destroy(); _worker = null; store.setStatus('cancelled'); return; }

  // Analyze every position sequentially.
  const rawEvals: (EngineScore | null)[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (_cancelled) break;
    store.setProgress(i, total);
    const result = await analyzePosition(
      _worker,
      nodes[i].fen,
      analysisMultiPv,
      analysisDepth,
      analysisHashMb,
    );
    rawEvals.push(result);
  }

  // Destroy the worker immediately — we no longer need it.
  _worker.destroy();
  _worker = null;

  if (_cancelled) {
    store.setStatus('cancelled');
    return;
  }

  const startColor = root.fen.split(' ')[1] === 'b' ? 'black' : 'white';

  // ------------------------------------------------------------------
  // Derive win percentages for graphing and aggregation.
  // ------------------------------------------------------------------
  const sideToMoveWinPercents: number[] = [winPercent(INITIAL_CP)];
  const whiteWinPercents: number[] = rawEvals.map((ev, i) => {
    if (!ev) return i === 0 ? scoreToWhiteWinPct({ cp: INITIAL_CP }, startColor === 'white') : 50;
    const fen = nodes[i].fen;
    const whiteToMove = fen.split(' ')[1] === 'w';
    if (i > 0) sideToMoveWinPercents.push(scoreToWinPercent(ev));
    return scoreToWhiteWinPct(ev, whiteToMove);
  });

  // ------------------------------------------------------------------
  // Compute per-position accuracy and classification.
  // ------------------------------------------------------------------
  const moveAccuracies: Array<{ color: 'white' | 'black'; accuracy: number }> = [];
  const positions: PositionEval[] = nodes.map((node, i) => {
    const base: PositionEval = {
      ply: node.ply,
      san: 'san' in node ? node.san : undefined,
      uci: 'uci' in node ? node.uci : undefined,
      whiteWinPct: whiteWinPercents[i],
    };
    if (i === 0) return base; // no move leads to the starting position

    const prevFen = nodes[i - 1].fen;
    const prevWhiteToMove = prevFen.split(' ')[1] === 'w';
    const moverColor: 'white' | 'black' = prevWhiteToMove ? 'white' : 'black';
    const beforeSubjective: EngineScore =
      i === 1
        ? { cp: INITIAL_CP }
        : rawEvals[i - 1] ?? { cp: INITIAL_CP };
    const afterSubjective = invertScore(rawEvals[i] ?? { cp: 0 });
    const beforeWin = scoreToWinPercent(beforeSubjective);
    const afterWin = scoreToWinPercent(afterSubjective);
    const accuracy = afterWin >= beforeWin ? 100 : moveAccuracy(beforeWin - afterWin);
    const classification = classifyMoveLikeLichess(beforeSubjective, afterSubjective);
    moveAccuracies.push({ color: moverColor, accuracy });
    return { ...base, accuracy, classification };
  });

  const gameAccuracies = gameAccuracyByColor(moveAccuracies, sideToMoveWinPercents);

  // ------------------------------------------------------------------
  // Aggregate per-player stats.
  // ------------------------------------------------------------------
  const whiteCpls: number[] = [];
  const blackCpls: number[] = [];
  let whiteBlunders = 0, whiteMistakes = 0, whiteInaccuracies = 0;
  let blackBlunders = 0, blackMistakes = 0, blackInaccuracies = 0;

  for (let i = 1; i < positions.length; i++) {
    const pos = positions[i];
    const prevFen = nodes[i - 1].fen;
    const prevWhiteToMove = prevFen.split(' ')[1] === 'w';

    if (pos.accuracy !== undefined) {
      // CPL: cpBefore is from mover's perspective; cpAfter is from opponent's
      // perspective. From mover's view after the move: -cpAfter.
      // Loss = cpBefore - (-cpAfter) = cpBefore + cpAfter.
      const cpBefore = clampCp(rawEvals[i - 1]?.cp, rawEvals[i - 1]?.mate);
      const cpAfter  = clampCp(rawEvals[i]?.cp,     rawEvals[i]?.mate);
      const cpl = Math.max(0, cpBefore + cpAfter);

      if (prevWhiteToMove) {
        whiteCpls.push(cpl);
      } else {
        blackCpls.push(cpl);
      }
    }

    if (pos.classification && pos.classification !== 'good') {
      if (prevWhiteToMove) {
        if (pos.classification === 'blunder') whiteBlunders++;
        else if (pos.classification === 'mistake') whiteMistakes++;
        else whiteInaccuracies++;
      } else {
        if (pos.classification === 'blunder') blackBlunders++;
        else if (pos.classification === 'mistake') blackMistakes++;
        else blackInaccuracies++;
      }
    }
  }

  const white: PlayerStats = {
    accuracy: Math.round(gameAccuracies.white),
    acpl: whiteCpls.length > 0
      ? Math.round(whiteCpls.reduce((a, b) => a + b, 0) / whiteCpls.length)
      : 0,
    blunders: whiteBlunders,
    mistakes: whiteMistakes,
    inaccuracies: whiteInaccuracies,
  };

  const black: PlayerStats = {
    accuracy: Math.round(gameAccuracies.black),
    acpl: blackCpls.length > 0
      ? Math.round(blackCpls.reduce((a, b) => a + b, 0) / blackCpls.length)
      : 0,
    blunders: blackBlunders,
    mistakes: blackMistakes,
    inaccuracies: blackInaccuracies,
  };

  store.setPositions(positions);
  store.setStats(white, black);
  store.setProgress(total, total);
  store.setStatus('complete');
}

export function cancelRunAnalysis(): void {
  _cancelled = true;
  _worker?.destroy();
  _worker = null;
  if (useAnalysisStore.getState().status === 'running') {
    useAnalysisStore.getState().setStatus('cancelled');
  }
}

/** Mount once at the app root to ensure cleanup on unmount. */
export function useRunAnalysis(): void {
  useEffect(() => {
    return () => {
      cancelRunAnalysis();
    };
  }, []);
}
