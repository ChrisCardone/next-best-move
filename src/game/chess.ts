import { Chess } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { parseSquare, makeSquare, parseUci, makeUci } from 'chessops/util';
import { makeFen, parseFen } from 'chessops/fen';
import type { NormalMove } from 'chessops/types';
import type { Key } from '@lichess-org/chessground/types';

/** Build a chessground `dests` map from a chessops position. */
export function legalDests(pos: Chess) {
  return chessgroundDests(pos);
}

/** Whose turn it is in chessground's "color" type. */
export function turnColor(pos: Chess): 'white' | 'black' {
  return pos.turn;
}

/** Last move as a chessground Key[] (from, to), or undefined. */
export function lastMoveSquares(uci: string | undefined): Key[] | undefined {
  if (!uci) return undefined;
  const move = parseUci(uci);
  if (!move || !('from' in move)) return undefined;
  return [makeSquare(move.from) as Key, makeSquare(move.to) as Key];
}

/** Color in check, or undefined when not in check. Chessground will
 *  highlight the king of that color automatically. */
export function checkColor(pos: Chess): 'white' | 'black' | undefined {
  return pos.isCheck() ? pos.turn : undefined;
}

export {
  Chess,
  parseSquare,
  makeSquare,
  parseUci,
  makeUci,
  makeFen,
  parseFen,
};

export type { NormalMove };
