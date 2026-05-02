import type { ExplorerMove } from './lichessExplorer';

export type ExplorerSide = 'white' | 'black';

export function winPctForSide(move: ExplorerMove, side: ExplorerSide): number {
  const total = move.white + move.draws + move.black;
  if (total <= 0) return 0;
  return side === 'white' ? move.white / total : move.black / total;
}

export function pickBestWinningMove(
  moves: ExplorerMove[],
  totalGames: number,
  side: ExplorerSide,
  minPopularityPct: number,
): ExplorerMove | null {
  if (totalGames <= 0) return null;

  const eligible = moves.filter((move) => {
    const total = move.white + move.draws + move.black;
    return total / totalGames >= minPopularityPct / 100;
  });
  if (eligible.length === 0) return null;

  return eligible.reduce((best, current) => {
    const bestWin = winPctForSide(best, side);
    const currentWin = winPctForSide(current, side);
    if (currentWin > bestWin) return current;
    if (currentWin < bestWin) return best;

    const bestTotal = best.white + best.draws + best.black;
    const currentTotal = current.white + current.draws + current.black;
    return currentTotal > bestTotal ? current : best;
  });
}