import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { nodesOnPath } from './tree';
import type { RootNode } from './tree';
import type { Path } from './path';

/**
 * Replay the moves from root to `path`, returning the final position.
 * Returns the starting position if the path is empty or invalid.
 */
export function positionAtPath(root: RootNode, path: Path): Chess {
  const setup = parseFen(root.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const nodes = nodesOnPath(root, path);
  // First entry is the root — skip it.
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (!('uci' in node)) break;
    const move = parseUci(node.uci);
    if (!move || !pos.isLegal(move)) break;
    pos.play(move);
  }
  return pos;
}
