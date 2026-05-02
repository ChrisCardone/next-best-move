import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { useGameStore } from '../game/store';
import type { AnyNode, MoveNode } from '../game/tree';
import type { Path } from '../game/path';

interface VariationMenuState {
  path: Path;
  san: string;
  x: number;
  y: number;
}

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
  const deleteVariation = useGameStore((s) => s.deleteVariation);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<VariationMenuState | null>(null);
  const rows = buildRows(root, '');

  // Auto-scroll the active move into view when path changes.
  useEffect(() => {
    if (!containerRef.current) return;
    const active = containerRef.current.querySelector('.move.is-active');
    if (active) {
      (active as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [path, root]);

  useEffect(() => {
    if (!menu) return;

    function closeMenu() {
      setMenu(null);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
    }

    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', closeMenu);
    };
  }, [menu]);

  function openVariationMenu(e: MouseEvent, variation: VariationStart) {
    e.preventDefault();
    setMenu({
      path: variation.path,
      san: variation.node.san,
      x: e.clientX,
      y: e.clientY,
    });
  }

  function onDeleteVariationFromMenu() {
    if (!menu) return;
    deleteVariation(menu.path);
    setMenu(null);
  }

  return (
    <div className="movelist" ref={containerRef}>
      {root.comments && root.comments.length > 0 && (
        <div className="movelist__comment">{root.comments.join(' ')}</div>
      )}
      {rows.length === 0 ? (
        <div className="movelist__empty">No moves yet. Make a move on the board.</div>
      ) : (
        <div className="movelist__rows">
          {rows.map((row, i) => {
            const stripe = i % 2 === 0 ? 'light' : 'dark';
            return (
            <div key={row.id}>
              <div className={`movelist__row movelist__row--${stripe}`}>
                <span className="movelist__num">{row.moveNumber}.</span>
                <div className="movelist__cell">
                  {row.white ? renderMoveButton(row.white.node, row.white.path, path, goTo) : null}
                </div>
                <div className="movelist__cell">
                  {row.black
                    ? renderMoveButton(row.black.node, row.black.path, path, goTo)
                    : <span className="movelist__ellipsis">...</span>}
                </div>
              </div>

              {row.white?.variations.map((v, i) => (
                <VariationBranch
                  key={`var-w-${row.id}-${i}`}
                  start={v}
                  activePath={path}
                  goTo={goTo}
                  stripe={stripe}
                  depth={1}
                  onOpenMenu={openVariationMenu}
                />
              ))}
              {row.black?.variations.map((v, i) => (
                <VariationBranch
                  key={`var-b-${row.id}-${i}`}
                  start={v}
                  activePath={path}
                  goTo={goTo}
                  stripe={stripe}
                  depth={1}
                  onOpenMenu={openVariationMenu}
                />
              ))}
            </div>
            );
          })}
        </div>
      )}

      {menu && (
        <div
          className="movelist__context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="movelist__context-item"
            onClick={onDeleteVariationFromMenu}
          >
            Delete variation ({menu.san})
          </button>
        </div>
      )}
    </div>
  );
}

function renderMoveButton(
  node: MoveNode,
  path: Path,
  activePath: Path,
  goTo: (p: Path) => void,
): ReactNode {
  return (
    <button
      type="button"
      className={'move' + (path === activePath ? ' is-active' : '')}
      onClick={() => goTo(path)}
      title={node.uci}
    >
      {node.san}
      {node.nags && node.nags.length > 0 && (
        <span className="move__nags">{node.nags.map((n) => nagToGlyph(n)).join('')}</span>
      )}
    </button>
  );
}

interface VariationBranchProps {
  start: VariationStart;
  activePath: Path;
  goTo: (p: Path) => void;
  stripe: 'light' | 'dark';
  depth: number;
  onOpenMenu: (e: MouseEvent, variation: VariationStart) => void;
}

function VariationBranch({
  start,
  activePath,
  goTo,
  stripe,
  depth,
  onOpenMenu,
}: VariationBranchProps): ReactNode {
  const lineTokens: ReactNode[] = [];
  const nested: VariationStart[] = [];

  let node: MoveNode | null = start.node;
  let nodePath: Path = start.path;

  while (node) {
    const isWhite = node.ply % 2 === 1;
    const moveNumber = Math.ceil(node.ply / 2);
    const prefix = isWhite ? `${moveNumber}.` : `${moveNumber}...`;
    lineTokens.push(
      <span key={`n-${nodePath}`} className="movelist__variation-num">
        {prefix}
      </span>,
    );
    lineTokens.push(
      <span key={`m-${nodePath}`} className="movelist__variation-move">
        {renderMoveButton(node, nodePath, activePath, goTo)}
      </span>,
    );

    for (const alt of node.children.slice(1)) {
      nested.push({
        node: alt,
        path: (nodePath + alt.id) as Path,
      });
    }

    if (node.children.length === 0) break;
    const next = node.children[0] as MoveNode;
    nodePath = (nodePath + next.id) as Path;
    node = next;
  }

  const style = { '--var-depth': depth } as CSSProperties;

  return (
    <>
      <div
        className={`movelist__variation-row movelist__variation-row--${stripe}`}
        style={style}
        onContextMenu={(e) => onOpenMenu(e, start)}
        title={`Right-click to open menu for variation starting with ${start.node.san}`}
      >
        <div className="movelist__variation-content">{lineTokens}</div>
      </div>
      {nested.map((child, i) => (
        <VariationBranch
          key={`nested-${child.path}-${i}`}
          start={child}
          activePath={activePath}
          goTo={goTo}
          stripe={stripe}
          depth={depth + 1}
          onOpenMenu={onOpenMenu}
        />
      ))}
    </>
  );
}

type VariationStart = {
  node: MoveNode;
  path: Path;
};

type MainlineEntry = {
  node: MoveNode;
  path: Path;
  variations: VariationStart[];
};

type MoveRow = {
  id: string;
  moveNumber: number;
  white: MainlineEntry | null;
  black: MainlineEntry | null;
};

function buildRows(root: AnyNode, rootPath: Path): MoveRow[] {
  const entries: MainlineEntry[] = [];
  let parent: AnyNode = root;
  let parentPath = rootPath;

  while (parent.children.length > 0) {
    const main = parent.children[0];
    const path = parentPath + main.id;
    const variations = parent.children.slice(1).map((alt) => ({
      node: alt,
      path: parentPath + alt.id,
    }));

    entries.push({ node: main, path, variations });

    parent = main;
    parentPath = path;
  }

  const rows: MoveRow[] = [];
  for (const entry of entries) {
    const isWhite = entry.node.ply % 2 === 1;
    const moveNumber = Math.ceil(entry.node.ply / 2);
    const last = rows[rows.length - 1];

    if (isWhite || !last || last.moveNumber !== moveNumber) {
      rows.push({
        id: `row-${moveNumber}-${entry.path}`,
        moveNumber,
        white: isWhite ? entry : null,
        black: isWhite ? null : entry,
      });
      continue;
    }

    last.black = entry;
  }

  return rows;
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
