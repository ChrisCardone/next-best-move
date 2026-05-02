import { describe, expect, it } from 'vitest';
import { pickBestWinningMove, winPctForSide } from './bestMove';
import type { ExplorerMove } from './lichessExplorer';

function move(uci: string, white: number, draws: number, black: number): ExplorerMove {
  return { uci, san: uci, white, draws, black };
}

describe('bestMove', () => {
  it('computes win percentage for the requested side', () => {
    const sample = move('e2e4', 55, 25, 20);

    expect(winPctForSide(sample, 'white')).toBe(0.55);
    expect(winPctForSide(sample, 'black')).toBe(0.2);
  });

  it('picks the eligible move with the best win rate for the side to move', () => {
    const moves = [
      move('e2e4', 70, 10, 20),
      move('d2d4', 40, 20, 40),
      move('g1f3', 35, 15, 50),
    ];

    expect(pickBestWinningMove(moves, 300, 'black', 20)?.uci).toBe('g1f3');
  });

  it('filters out moves below the popularity threshold', () => {
    const moves = [
      move('e2e4', 9, 0, 1),
      move('d2d4', 45, 10, 45),
    ];

    expect(pickBestWinningMove(moves, 100, 'white', 20)?.uci).toBe('d2d4');
  });

  it('breaks win-rate ties by popularity', () => {
    const moves = [
      move('e2e4', 50, 0, 50),
      move('d2d4', 100, 0, 100),
    ];

    expect(pickBestWinningMove(moves, 300, 'white', 1)?.uci).toBe('d2d4');
  });
});