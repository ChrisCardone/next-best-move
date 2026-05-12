import { describe, expect, it } from 'vitest';
import {
  analyzeGameFromWhitePovEvals,
  classifyChanceDrop,
  classifyMoveLikeLichess,
  clampCp,
  invertScore,
  moveAccuracy,
  scoreToWhiteWinPct,
  scoreToWinPercent,
  winPercent,
  winningChances,
  type EngineScore,
} from './accuracy';

describe('winPercent', () => {
  it('is 50 at equal evaluation', () => {
    expect(winPercent(0)).toBeCloseTo(50, 5);
  });

  it('saturates near 0 and 100 for ±1000 cp', () => {
    expect(winPercent(1000)).toBeGreaterThan(97);
    expect(winPercent(-1000)).toBeLessThan(3);
  });

  it('is monotonically increasing', () => {
    expect(winPercent(100)).toBeGreaterThan(winPercent(0));
    expect(winPercent(0)).toBeGreaterThan(winPercent(-100));
  });
});

describe('winningChances', () => {
  it('is 0 at equal evaluation', () => {
    expect(winningChances(0)).toBeCloseTo(0, 5);
  });

  it('is bounded in [-1, 1]', () => {
    expect(winningChances(99999)).toBeLessThanOrEqual(1);
    expect(winningChances(-99999)).toBeGreaterThanOrEqual(-1);
  });
});

describe('moveAccuracy', () => {
  it('returns 100 for zero drop (clamped)', () => {
    expect(moveAccuracy(0)).toBe(100);
  });

  it('decreases as drop grows', () => {
    expect(moveAccuracy(20)).toBeLessThan(moveAccuracy(5));
    expect(moveAccuracy(50)).toBeLessThan(moveAccuracy(20));
  });

  it('treats negative drops as zero', () => {
    expect(moveAccuracy(-10)).toBe(100);
  });

  it('approaches 0 for very large drops', () => {
    expect(moveAccuracy(100)).toBeLessThan(2);
  });
});

describe('classifyChanceDrop', () => {
  it('classifies at exact boundaries', () => {
    expect(classifyChanceDrop(0.3)).toBe('blunder');
    expect(classifyChanceDrop(0.2)).toBe('mistake');
    expect(classifyChanceDrop(0.1)).toBe('inaccuracy');
    expect(classifyChanceDrop(0)).toBe('good');
  });

  it('classifies just below boundaries', () => {
    expect(classifyChanceDrop(0.29)).toBe('mistake');
    expect(classifyChanceDrop(0.19)).toBe('inaccuracy');
    expect(classifyChanceDrop(0.09)).toBe('good');
  });
});

describe('clampCp', () => {
  it('returns 0 when neither cp nor mate is given', () => {
    expect(clampCp(undefined, undefined)).toBe(0);
  });

  it('passes cp through within bounds', () => {
    expect(clampCp(250, undefined)).toBe(250);
    expect(clampCp(-250, undefined)).toBe(-250);
  });

  it('clamps cp to ±1000', () => {
    expect(clampCp(5000, undefined)).toBe(1000);
    expect(clampCp(-5000, undefined)).toBe(-1000);
  });

  it('mate dominates cp and resolves to ±1000', () => {
    expect(clampCp(50, 3)).toBe(1000);
    expect(clampCp(50, -3)).toBe(-1000);
  });
});

describe('invertScore', () => {
  it('negates cp', () => {
    expect(invertScore({ cp: 75 })).toEqual({ cp: -75, mate: undefined });
  });

  it('negates mate', () => {
    expect(invertScore({ mate: 4 })).toEqual({ cp: undefined, mate: -4 });
  });

  it('round-trips to the original', () => {
    const a = { cp: 123, mate: undefined };
    expect(invertScore(invertScore(a))).toEqual(a);
    const b = { cp: undefined, mate: -7 };
    expect(invertScore(invertScore(b))).toEqual(b);
  });
});

describe('scoreToWhiteWinPct', () => {
  it('agrees with scoreToWinPercent when white is to move', () => {
    const score = { cp: 50 };
    expect(scoreToWhiteWinPct(score, true)).toBeCloseTo(scoreToWinPercent(score), 5);
  });

  it('inverts when black is to move', () => {
    const score = { cp: 100 };
    const w = scoreToWhiteWinPct(score, true);
    const b = scoreToWhiteWinPct(score, false);
    expect(w + b).toBeCloseTo(100, 5);
  });
});

describe('classifyMoveLikeLichess', () => {
  it('classifies a flat position as good', () => {
    // identical winning chances → no drop
    expect(classifyMoveLikeLichess({ cp: 50 }, { cp: 50 })).toBe('good');
  });

  it('classifies a huge drop in winning chances as blunder', () => {
    // winning → losing badly
    expect(classifyMoveLikeLichess({ cp: 500 }, { cp: -500 })).toBe('blunder');
  });

  it('non-mate → being-mated is a blunder when winning beforehand', () => {
    expect(classifyMoveLikeLichess({ cp: 100 }, { mate: -3 })).toBe('blunder');
  });

  it('non-mate → being-mated is downgraded to inaccuracy when already losing badly', () => {
    expect(classifyMoveLikeLichess({ cp: -1500 }, { mate: -3 })).toBe('inaccuracy');
  });

  it('having-mate → no-mate is a blunder when only a small cp advantage remains', () => {
    expect(classifyMoveLikeLichess({ mate: 2 }, { cp: 100 })).toBe('blunder');
  });

  it('having-mate → no-mate is just an inaccuracy when still huge advantage remains', () => {
    expect(classifyMoveLikeLichess({ mate: 2 }, { cp: 1500 })).toBe('inaccuracy');
  });

  it('flipping mate-for-us to mate-against-us is always a blunder', () => {
    expect(classifyMoveLikeLichess({ mate: 3 }, { mate: -3 })).toBe('blunder');
  });
});

// ---------------------------------------------------------------------------
// Fixture tests against real Lichess game-export accuracy.
//
// Each fixture is an `analysis[]` array fetched from
//   GET /game/export/{id}?evals=true&accuracy=true
// alongside the reported `players.{white,black}.analysis.{accuracy,acpl,...}`.
// The eval list is white-POV per-ply (no root). We prepend INITIAL_CP-implicit
// root to match the shape `analyzeGameFromWhitePovEvals` expects.
//
// We assert accuracy within ±2 and ACPL within ±3 of Lichess's reported
// values. Tighter than that exposes rounding drift between Scala Double and
// JS Number on long games (lila does no rounding until the final cast).
// ---------------------------------------------------------------------------

interface LichessGameFixture {
  id: string;
  whiteEvals: ReadonlyArray<EngineScore>;
  expected: {
    white: { accuracy: number; acpl: number; blunders: number; mistakes: number; inaccuracies: number };
    black: { accuracy: number; acpl: number; blunders: number; mistakes: number; inaccuracies: number };
  };
}

// negativeelo513 vs maia5, 2026-02-08. Black wins. White (user) 70 / 60 ACPL.
const FIXTURE_PTs5L75r: LichessGameFixture = {
  id: 'PTs5L75r',
  whiteEvals: [
    { cp: 18 }, { cp: 22 }, { cp: 18 }, { cp: 21 }, { cp: 7 }, { cp: 4 }, { cp: 6 },
    { cp: 63 }, { cp: 54 }, { cp: 175 }, { cp: 94 }, { cp: 88 }, { cp: 95 }, { cp: 103 },
    { cp: 135 }, { cp: 134 }, { cp: 125 }, { cp: 209 }, { cp: 219 }, { cp: 230 }, { cp: 208 },
    { cp: 172 }, { cp: 158 }, { cp: 244 }, { cp: 184 }, { cp: 236 }, { cp: 113 }, { cp: 108 },
    { cp: 96 }, { cp: 102 }, { cp: 93 }, { cp: 102 }, { cp: 75 }, { cp: 152 }, { cp: 180 },
    { cp: 218 }, { cp: 211 }, { cp: 175 }, { cp: 132 }, { cp: 137 }, { cp: 0 }, { cp: 75 },
    { cp: 78 }, { cp: 59 }, { cp: -753 }, { cp: -745 },
  ],
  expected: {
    white: { accuracy: 70, acpl: 60, blunders: 1, mistakes: 2, inaccuracies: 1 },
    black: { accuracy: 89, acpl: 28, blunders: 0, mistakes: 1, inaccuracies: 5 },
  },
};

// negativeelo513 (white) vs Aboelfutooh, 2026-02-04. White wins. User 92 / 25 ACPL.
const FIXTURE_DmVGst68: LichessGameFixture = {
  id: 'DmVGst68',
  whiteEvals: [
    { cp: 18 }, { cp: 31 }, { cp: 24 }, { cp: 24 }, { cp: 19 }, { cp: 47 }, { cp: 50 },
    { cp: 104 }, { cp: 36 }, { cp: 55 }, { cp: 48 }, { cp: 43 }, { cp: -15 }, { cp: -18 },
    { cp: -30 }, { cp: -40 }, { cp: -41 }, { cp: 65 }, { cp: -39 }, { cp: 191 }, { cp: 114 },
    { cp: 224 }, { cp: 225 }, { cp: 217 }, { cp: 223 }, { cp: 259 }, { cp: 235 }, { cp: 270 },
    { cp: 275 }, { cp: 280 }, { cp: 289 }, { cp: 277 }, { cp: 222 }, { cp: 209 }, { cp: 159 },
    { cp: 314 }, { cp: 309 }, { cp: 303 }, { cp: 305 }, { cp: 394 }, { cp: 366 }, { cp: 454 },
    { cp: 431 }, { cp: 486 }, { cp: 493 }, { cp: 496 }, { cp: 492 }, { cp: 494 }, { cp: 494 },
    { cp: 638 }, { cp: 456 }, { cp: 544 }, { cp: 530 }, { cp: 525 }, { cp: 515 }, { cp: 722 },
    { cp: 710 }, { cp: 695 }, { cp: 682 },
  ],
  expected: {
    white: { accuracy: 92, acpl: 25, blunders: 0, mistakes: 0, inaccuracies: 5 },
    black: { accuracy: 83, acpl: 51, blunders: 1, mistakes: 1, inaccuracies: 5 },
  },
};

const ACC_TOLERANCE = 2;
const ACPL_TOLERANCE = 3;

function runFixture(f: LichessGameFixture) {
  // Lichess's analysis[] is per-ply (no root). The pure analyzer expects the
  // root prepended; pass null so it falls back to INITIAL_CP.
  const evals: (EngineScore | null)[] = [null, ...f.whiteEvals];
  const result = analyzeGameFromWhitePovEvals(evals, true);

  expect(result.white.accuracy, `${f.id} white accuracy`).toBeGreaterThanOrEqual(f.expected.white.accuracy - ACC_TOLERANCE);
  expect(result.white.accuracy, `${f.id} white accuracy`).toBeLessThanOrEqual(f.expected.white.accuracy + ACC_TOLERANCE);
  expect(result.black.accuracy, `${f.id} black accuracy`).toBeGreaterThanOrEqual(f.expected.black.accuracy - ACC_TOLERANCE);
  expect(result.black.accuracy, `${f.id} black accuracy`).toBeLessThanOrEqual(f.expected.black.accuracy + ACC_TOLERANCE);

  expect(result.white.acpl, `${f.id} white ACPL`).toBeGreaterThanOrEqual(f.expected.white.acpl - ACPL_TOLERANCE);
  expect(result.white.acpl, `${f.id} white ACPL`).toBeLessThanOrEqual(f.expected.white.acpl + ACPL_TOLERANCE);
  expect(result.black.acpl, `${f.id} black ACPL`).toBeGreaterThanOrEqual(f.expected.black.acpl - ACPL_TOLERANCE);
  expect(result.black.acpl, `${f.id} black ACPL`).toBeLessThanOrEqual(f.expected.black.acpl + ACPL_TOLERANCE);
}

describe('analyzeGameFromWhitePovEvals — Lichess fixtures', () => {
  it('matches Lichess accuracy + ACPL for game PTs5L75r (negativeelo513 black)', () => {
    runFixture(FIXTURE_PTs5L75r);
  });

  it('matches Lichess accuracy + ACPL for game DmVGst68 (negativeelo513 white)', () => {
    runFixture(FIXTURE_DmVGst68);
  });
});
