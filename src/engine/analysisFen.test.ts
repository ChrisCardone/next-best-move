import { describe, expect, it } from 'vitest';
import { fenForAnalysis } from './analysisFen';

describe('fenForAnalysis', () => {
  it('returns the original FEN for normal analysis', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

    expect(fenForAnalysis(fen, false)).toBe(fen);
  });

  it('flips the side to move and clears en passant for threat analysis', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR w KQkq e6 0 2';

    expect(fenForAnalysis(fen, true)).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 2',
    );
  });
});