import { Chess, parseUci } from '../game/chess';
import { parseFen, makeBoardFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';

export interface PvBoard {
  /** Board-only FEN (pieces, no castling/ep) — sufficient for Chessground display. */
  fen: string;
  /** The UCI move played to reach this position. */
  uci: string;
}

/**
 * Convert a UCI principal-variation array into SAN strings, starting from
 * the given FEN. Stops at the first illegal/unparsable move.
 *
 * Returns SAN moves, the ply at which the PV starts (so the caller can
 * render move numbers correctly), and a parallel `boards` array with the
 * board FEN + UCI for each move (used for the hover mini board preview).
 */
export function pvToSan(
  fen: string,
  pv: string[],
): { sans: string[]; startPly: number; boards: PvBoard[] } {
  const setup = parseFen(fen);
  if (!setup.isOk) return { sans: [], startPly: 0, boards: [] };
  const posResult = Chess.fromSetup(setup.value);
  if (!posResult.isOk) return { sans: [], startPly: 0, boards: [] };
  const pos = posResult.value;

  const sans: string[] = [];
  const initialBoardFen = makeBoardFen(pos.board);
  const boards: PvBoard[] = [{ fen: initialBoardFen, uci: '' }];
  for (const uci of pv) {
    const move = parseUci(uci);
    if (!move) break;
    if (!pos.isLegal(move)) break;
    sans.push(makeSan(pos, move));
    pos.play(move);
    boards.push({ fen: makeBoardFen(pos.board), uci });
  }

  // ply: half-moves from start. fullmoves is 1-based, turn 'white' before move.
  const startPly = (setup.value.fullmoves - 1) * 2 + (setup.value.turn === 'white' ? 0 : 1);
  return { sans, startPly, boards };
}
