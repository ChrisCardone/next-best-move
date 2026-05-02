import { Chess } from 'chessops/chess';
import { makeFen, INITIAL_FEN } from 'chessops/fen';
import { parseSan, makeSanAndPlay } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { parsePgn, startingPosition, transform } from 'chessops/pgn';
import type { PgnNodeData, ChildNode } from 'chessops/pgn';
import { generateId } from './path';
import type { MoveNode, RootNode } from './tree';

interface Ctx {
  pos: Chess;
  ply: number;
  clone(): Ctx;
}

function ctxClone(this: Ctx): Ctx {
  return { pos: this.pos.clone(), ply: this.ply, clone: ctxClone };
}

interface Augmented extends PgnNodeData {
  uci: string;
  fen: string;
  ply: number;
  clockMs?: number;
}

/** Regex matching [%clk H:MM:SS] or [%clk H:MM:SS.s] clock annotations. */
const CLK_RE = /\[%clk\s+(\d+):(\d{2}):(\d{2}(?:\.\d+)?)\]/i;

/**
 * Extract a [%clk] annotation from an array of PGN comments.
 * Returns the clock in milliseconds and the comments with the annotation stripped.
 */
function extractClock(comments: string[] | undefined): {
  clockMs: number | undefined;
  cleaned: string[] | undefined;
} {
  if (!comments?.length) return { clockMs: undefined, cleaned: comments };
  let clockMs: number | undefined;
  const cleaned = comments
    .map((c) => {
      const m = CLK_RE.exec(c);
      if (m && clockMs === undefined) {
        const h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const sec = parseFloat(m[3]);
        clockMs = (h * 3600 + min * 60 + sec) * 1000;
      }
      return c.replace(CLK_RE, '').trim();
    })
    .filter((c) => c.length > 0);
  return { clockMs, cleaned: cleaned.length > 0 ? cleaned : undefined };
}

export interface PgnParseResult {
  root: RootNode;
  white: string;
  black: string;
  whiteElo: number | undefined;
  blackElo: number | undefined;
}

/**
 * Parse a PGN string into our internal tree format. Returns the first
 * game found, or undefined if parsing produced nothing usable.
 *
 * Comments, NAGs and variations are preserved. Clock annotations ([%clk])
 * are extracted from comments and stored on nodes as `clockMs`.
 */
export function pgnToTree(pgn: string): PgnParseResult | undefined {
  const games = parsePgn(pgn);
  if (games.length === 0) return undefined;
  const game = games[0];

  const startResult = startingPosition(game.headers);
  if (!startResult.isOk) return undefined;
  const startPos = startResult.value as Chess;
  const rootFen = makeFen(startPos.toSetup());
  const rootPly = startPos.fullmoves * 2 - (startPos.turn === 'white' ? 2 : 1);

  const ctx: Ctx = { pos: startPos, ply: rootPly, clone: ctxClone };

  const augmented = transform<PgnNodeData, Augmented, Ctx>(
    game.moves,
    ctx,
    (c, data) => {
      const move = parseSan(c.pos, data.san);
      if (!move) return undefined; // Cuts off branch on illegal move
      const uci = makeUci(move);
      const san = makeSanAndPlay(c.pos, move); // mutates c.pos
      c.ply++;
      const { clockMs, cleaned } = extractClock(data.comments);
      return {
        ...data,
        comments: cleaned,
        san,
        uci,
        fen: makeFen(c.pos.toSetup()),
        ply: c.ply,
        clockMs,
      };
    },
  );

  // Convert chessops's tree to our tree.
  const root: RootNode = {
    fen: rootFen,
    ply: rootPly,
    comments: game.comments,
    children: augmented.children.map((c) => convertChild(c as ChildNode<Augmented>)),
  };

  const white = game.headers.get('White') ?? '';
  const black = game.headers.get('Black') ?? '';
  const whiteEloRaw = game.headers.get('WhiteElo');
  const blackEloRaw = game.headers.get('BlackElo');
  const whiteElo = whiteEloRaw ? parseInt(whiteEloRaw, 10) || undefined : undefined;
  const blackElo = blackEloRaw ? parseInt(blackEloRaw, 10) || undefined : undefined;

  return { root, white, black, whiteElo, blackElo };
}

function convertChild(node: ChildNode<Augmented>): MoveNode {
  const taken = new Set<string>();
  const children = node.children.map((c) => {
    const out = convertChild(c as ChildNode<Augmented>);
    taken.add(out.id);
    return out;
  });
  return {
    id: generateId(taken),
    ply: node.data.ply,
    uci: node.data.uci,
    san: node.data.san,
    fen: node.data.fen,
    clockMs: node.data.clockMs,
    comments: node.data.comments,
    nags: node.data.nags,
    children,
  };
}

/** Empty tree at the standard starting position. */
export function defaultRoot(): RootNode {
  return { fen: INITIAL_FEN, ply: 0, children: [] };
}
