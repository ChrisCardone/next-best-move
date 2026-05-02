import { describe, expect, it } from 'vitest';
import { INITIAL_FEN } from 'chessops/fen';
import { pvToSan } from './pvToSan';

describe('pvToSan', () => {
  it('converts a legal PV to SAN moves and preview boards', () => {
    const result = pvToSan(INITIAL_FEN, ['e2e4', 'e7e5', 'g1f3']);

    expect(result.sans).toEqual(['e4', 'e5', 'Nf3']);
    expect(result.startPly).toBe(0);
    expect(result.boards).toHaveLength(4);
    expect(result.boards[1].uci).toBe('e2e4');
  });

  it('stops at the first illegal move', () => {
    const result = pvToSan(INITIAL_FEN, ['e2e5', 'e7e5']);

    expect(result.sans).toEqual([]);
    expect(result.boards).toHaveLength(1);
  });
});