import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useGameStore } from '../game/store';
import type { AnyNode, MoveNode } from '../game/tree';
import type { Path } from '../game/path';

/**
 * Recursive variation-tree renderer modeled on the lichess analysis board.
 *
 * Algorithm: at each fork, we render the mainline move first, then each
 * alternative sibling as an indented variation block, then continue the
 * mainline. After variations, the next mainline move shows a
 * black-continuation indicator (e.g. `5...`) when applicable.
 */
export function MoveList() {
  const root = useGameStore((s) => s.root);
  const path = useGameStore((s) => s.path);
  const goTo = useGameStore((s) => s.goTo);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the active move into view when path changes.
  useEffect(() => {
    if (!containerRef.current) return;
    const active = containerRef.current.querySelector('.move.is-active');
    if (active) {
      (active as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [path, root]);

  return (
    <div className="movelist" ref={containerRef}>
      {root.comments && root.comments.length > 0 && (
        <div className="movelist__comment">{root.comments.join(' ')}</div>
      )}
      {root.children.length === 0 ? (
        <div className="movelist__empty">No moves yet. Make a move on the board.</div>
      ) : (
        <div className="movelist__line">
          {renderFork(root, '', path, goTo, /* needsBlackIndicator */ false)}
        </div>
      )}
    </div>
  );
}

function renderFork(
  parent: AnyNode,
  parentPath: Path,
  activePath: Path,
  goTo: (p: Path) => void,
  needsBlackIndicator: boolean,
): ReactNode[] {
  const out: ReactNode[] = [];
  if (parent.children.length === 0) return out;

  const main = parent.children[0];
  const mainPath = parentPath + main.id;

  // Mainline move
  out.push(...renderMoveWithNumber(main, mainPath, activePath, goTo, needsBlackIndicator));

  // Alternative variations after the mainline move
  for (let i = 1; i < parent.children.length; i++) {
    const alt = parent.children[i];
    const altPath = parentPath + alt.id;
    out.push(
      <span key={`var-${altPath}`} className="movelist__variation">
        {renderMoveWithNumber(alt, altPath, activePath, goTo, /* black indicator */ true)}
        {renderFork(alt, altPath, activePath, goTo, false)}
      </span>,
    );
  }

  // Recurse into the mainline. If we rendered any variations, the next
  // mainline move needs a black-continuation indicator for a black move.
  const hadVariations = parent.children.length > 1;
  out.push(...renderFork(main, mainPath, activePath, goTo, hadVariations));

  return out;
}

function renderMoveWithNumber(
  node: MoveNode,
  path: Path,
  activePath: Path,
  goTo: (p: Path) => void,
  forceBlackIndicator: boolean,
): ReactNode[] {
  const out: ReactNode[] = [];
  // ply is 1-indexed: ply 1 = white's first move.
  const isWhiteMove = node.ply % 2 === 1;
  const moveNumber = Math.ceil(node.ply / 2);

  if (isWhiteMove) {
    out.push(
      <span key={`num-${path}`} className="movelist__num">
        {moveNumber}.
      </span>,
    );
  } else if (forceBlackIndicator) {
    out.push(
      <span key={`num-${path}`} className="movelist__num">
        {moveNumber}…
      </span>,
    );
  }

  out.push(
    <button
      key={`mv-${path}`}
      type="button"
      className={'move' + (path === activePath ? ' is-active' : '')}
      onClick={() => goTo(path)}
      title={node.uci}
    >
      {node.san}
      {node.nags && node.nags.length > 0 && (
        <span className="move__nags">{node.nags.map((n) => nagToGlyph(n)).join('')}</span>
      )}
    </button>,
  );

  if (node.comments && node.comments.length > 0) {
    out.push(
      <span key={`cm-${path}`} className="movelist__comment-inline">
        {node.comments.join(' ')}
      </span>,
    );
  }

  return out;
}

// Quick lookup for the most common annotation NAGs.
function nagToGlyph(nag: number): string {
  switch (nag) {
    case 1: return '!';
    case 2: return '?';
    case 3: return '!!';
    case 4: return '??';
    case 5: return '!?';
    case 6: return '?!';
    default: return '';
  }
}
