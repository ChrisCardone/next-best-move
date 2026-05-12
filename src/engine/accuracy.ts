/**
 * Lichess-style accuracy + move-classification math.
 *
 * Pure functions: no React, no stores, no worker — safe to unit test.
 * Refs:
 *   - https://lichess.org/page/accuracy
 *   - lila AccuracyPercent.scala / AccuracyCP.scala
 */

export type MoveClassification = 'blunder' | 'mistake' | 'inaccuracy' | 'good';

export interface EngineScore {
  cp?: number;
  mate?: number;
}

export const INITIAL_CP = 15;

/**
 * Win% for the side to move, given centipawns (positive = side to move is winning).
 * Returns a value in [0, 100].
 */
export function winPercent(cp: number): number {
  return 100 / (1 + Math.exp(-0.00368208 * cp));
}

/** Lichess winning chances in [-1, 1]. */
export function winningChances(cp: number): number {
  return Math.max(-1, Math.min(1, 2 / (1 + Math.exp(-0.00368208 * cp)) - 1));
}

/**
 * White's winning chances [0, 100], given the UCI engine eval and whose turn it is.
 * UCI always reports eval from the side-to-move perspective.
 */
export function whiteWinPct(cp: number, whiteToMove: boolean): number {
  return whiteToMove ? winPercent(cp) : 100 - winPercent(cp);
}

/**
 * Accuracy of a single move, given the drop in win% for the side that moved.
 * `dropPct` is in percentage points [0, 100].
 * Formula: 103.1668 × e^(−0.04354 × drop) − 3.1669 + 1, clamped [0, 100].
 * The trailing "+ 1" is lila's "uncertainty bonus (due to imperfect analysis)"
 * — see AccuracyPercent.scala. Do not remove.
 */
export function moveAccuracy(dropPct: number): number {
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * Math.max(0, dropPct)) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}

/** Lichess move classification thresholds (in percentage-point win-chance drop). */
export function classifyChanceDrop(drop: number): MoveClassification {
  if (drop >= 0.3) return 'blunder';
  if (drop >= 0.2) return 'mistake';
  if (drop >= 0.1) return 'inaccuracy';
  return 'good';
}

/** Standard deviation for a window of win percentages. */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function weightedMean(values: Array<{ value: number; weight: number }>): number | null {
  if (values.length === 0) return null;
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

export function harmonicMean(values: number[]): number | null {
  if (values.length === 0) return null;
  const denom = values.reduce((sum, value) => sum + 1 / Math.max(value, 1e-9), 0);
  if (denom <= 0) return null;
  return values.length / denom;
}

/**
 * Lichess-style game accuracy: average of volatility-weighted mean and harmonic mean.
 */
export function gameAccuracyByColor(
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
export function clampCp(cp: number | undefined, mate: number | undefined): number {
  if (mate !== undefined) return mate > 0 ? 1000 : -1000;
  return Math.max(-1000, Math.min(1000, cp ?? 0));
}

export function invertScore(score: EngineScore): EngineScore {
  return {
    cp: score.cp !== undefined ? -score.cp : undefined,
    mate: score.mate !== undefined ? -score.mate : undefined,
  };
}

export function scoreToWhiteWinPct(score: EngineScore, whiteToMove: boolean): number {
  const cp = clampCp(score.cp, score.mate);
  return whiteWinPct(cp, whiteToMove);
}

export function scoreToWinPercent(score: EngineScore): number {
  return winPercent(clampCp(score.cp, score.mate));
}

export function scoreToWinningChances(score: EngineScore): number {
  return winningChances(clampCp(score.cp, score.mate));
}

/**
 * Pure aggregation of a Lichess-style game analysis from a per-position
 * white-POV eval list. Index 0 is the starting position; subsequent indices
 * are the position *after* each ply.
 *
 * `startsWithWhite` is true when the starting position has white-to-move
 * (true for a standard new game, false when analysing a sub-line that began
 * on black's move, e.g. a 960-from-mid-game import).
 *
 * Returns the same shape `startRunAnalysis` writes to `useAnalysisStore`.
 * Kept side-effect-free so it can be unit-tested against Lichess game-export
 * fixtures.
 */
export interface GameStats {
  accuracy: number;
  acpl: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
}

export interface PerMoveResult {
  /** White's win% at this position. */
  whiteWinPct: number;
  /** Accuracy of the move that led here [0,100], or undefined for index 0. */
  accuracy?: number;
  classification?: MoveClassification;
}

export interface GameAnalysisResult {
  perMove: PerMoveResult[];
  white: GameStats;
  black: GameStats;
}

export function analyzeGameFromWhitePovEvals(
  whitePovEvals: ReadonlyArray<EngineScore | null>,
  startsWithWhite = true,
): GameAnalysisResult {
  const n = whitePovEvals.length;

  // White-POV win% per position. Use INITIAL_CP for the starting position
  // (lila does the same — see scalachess Cp.initial = 15).
  const whiteWinPercents: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const ev = whitePovEvals[i];
    if (i === 0) {
      whiteWinPercents[i] = winPercent(INITIAL_CP);
    } else if (!ev) {
      whiteWinPercents[i] = 50;
    } else {
      whiteWinPercents[i] = scoreToWhiteWinPct(ev, true); // already white-POV
    }
  }

  const moveAccuracies: Array<{ color: 'white' | 'black'; accuracy: number }> = [];
  const perMove: PerMoveResult[] = new Array(n);

  const whiteToMoveAtIndex = (i: number): boolean =>
    startsWithWhite ? i % 2 === 0 : i % 2 === 1;

  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      perMove[i] = { whiteWinPct: whiteWinPercents[i] };
      continue;
    }

    // Mover's perspective: the side that was on move at position i-1.
    const moverIsWhite = whiteToMoveAtIndex(i - 1);
    const moverColor: 'white' | 'black' = moverIsWhite ? 'white' : 'black';

    // Convert white-POV evals into mover-POV for the win-drop math.
    const beforeWhite: EngineScore =
      i === 1
        ? { cp: INITIAL_CP }
        : whitePovEvals[i - 1] ?? { cp: INITIAL_CP };
    const rawAfterWhite = whitePovEvals[i];
    const afterWhite: EngineScore = rawAfterWhite ?? { cp: 0 };
    const beforeMover = moverIsWhite ? beforeWhite : invertScore(beforeWhite);
    const afterMover = moverIsWhite ? afterWhite : invertScore(afterWhite);

    // Mating-move detection: if the after-position has no eval (caller
    // stripped it because it's terminal) and the mover already had a winning
    // mate before the move, that move delivered it — 100% accuracy by
    // definition. Without this special case the fallback `{cp: 0}` for
    // missing after-evals would make Nd2# look like a blunder.
    const beforeMateForMover = beforeMover.mate !== undefined && beforeMover.mate > 0;
    if (!rawAfterWhite && beforeMateForMover) {
      moveAccuracies.push({ color: moverColor, accuracy: 100 });
      perMove[i] = { whiteWinPct: whiteWinPercents[i], accuracy: 100, classification: 'good' };
      continue;
    }

    const beforeWin = scoreToWinPercent(beforeMover);
    const afterWin = scoreToWinPercent(afterMover);
    const accuracy = afterWin >= beforeWin ? 100 : moveAccuracy(beforeWin - afterWin);
    const classification = classifyMoveLikeLichess(beforeMover, afterMover);

    moveAccuracies.push({ color: moverColor, accuracy });
    perMove[i] = { whiteWinPct: whiteWinPercents[i], accuracy, classification };
  }

  const gameAccuracies = gameAccuracyByColor(moveAccuracies, whiteWinPercents);

  const agg: Record<'white' | 'black', { cpls: number[]; blunders: number; mistakes: number; inaccuracies: number }> = {
    white: { cpls: [], blunders: 0, mistakes: 0, inaccuracies: 0 },
    black: { cpls: [], blunders: 0, mistakes: 0, inaccuracies: 0 },
  };

  for (let i = 1; i < n; i += 1) {
    const moverIsWhite = whiteToMoveAtIndex(i - 1);
    const color: 'white' | 'black' = moverIsWhite ? 'white' : 'black';
    const bucket = agg[color];

    // CPL is computed in mover-POV cp space, clamped to ±1000. Skip when
    // either side has no eval (e.g. terminal after-position).
    const beforeWhiteRaw = i === 1 ? { cp: INITIAL_CP } : whitePovEvals[i - 1];
    const afterWhiteRaw = whitePovEvals[i];
    if (beforeWhiteRaw && afterWhiteRaw) {
      const cpBeforeWhite = clampCp(beforeWhiteRaw.cp, beforeWhiteRaw.mate);
      const cpAfterWhite = clampCp(afterWhiteRaw.cp, afterWhiteRaw.mate);
      const cpBeforeMover = moverIsWhite ? cpBeforeWhite : -cpBeforeWhite;
      const cpAfterMover = moverIsWhite ? cpAfterWhite : -cpAfterWhite;
      bucket.cpls.push(Math.max(0, cpBeforeMover - cpAfterMover));
    }

    const cls = perMove[i].classification;
    if (cls === 'blunder') bucket.blunders += 1;
    else if (cls === 'mistake') bucket.mistakes += 1;
    else if (cls === 'inaccuracy') bucket.inaccuracies += 1;
  }

  const buildStats = (color: 'white' | 'black'): GameStats => {
    const { cpls, blunders, mistakes, inaccuracies } = agg[color];
    return {
      accuracy: Math.round(gameAccuracies[color]),
      acpl: cpls.length > 0 ? Math.round(cpls.reduce((a, b) => a + b, 0) / cpls.length) : 0,
      blunders,
      mistakes,
      inaccuracies,
    };
  };

  return {
    perMove,
    white: buildStats('white'),
    black: buildStats('black'),
  };
}

export function classifyMoveLikeLichess(before: EngineScore, after: EngineScore): MoveClassification {
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
