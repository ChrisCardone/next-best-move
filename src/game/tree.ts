import type { NodeId, Path } from './path';
import { ROOT_PATH, head, tail, append, generateId, parent } from './path';

/** A move played from the parent position. */
export interface MoveNode {
  id: NodeId;
  ply: number;
  /** UCI move (e.g. "e2e4", "e7e8q"). */
  uci: string;
  /** SAN of the move (e.g. "e4", "Nf3", "O-O"). */
  san: string;
  /** FEN of the resulting position. */
  fen: string;
  /** Remaining clock in milliseconds after this move, if PGN had [%clk] annotations. */
  clockMs?: number;
  comments?: string[];
  nags?: number[];
  children: MoveNode[];
}

/** Synthetic root — represents the starting position with no move played. */
export interface RootNode {
  ply: number;
  fen: string;
  comments?: string[];
  children: MoveNode[];
}

/** Either a root or a move node, useful for lookups by path. */
export type AnyNode = RootNode | MoveNode;

/** Walk the tree from root following `path`, returning the node found
 *  (the root for the empty path) or `undefined` if the path is invalid. */
export function nodeAtPath(root: RootNode, path: Path): AnyNode | undefined {
  let node: AnyNode = root;
  let rest = path;
  while (rest.length >= 2) {
    const id = head(rest)!;
    const child: MoveNode | undefined = node.children.find((c) => c.id === id);
    if (!child) return undefined;
    node = child;
    rest = tail(rest);
  }
  return node;
}

/** Return all nodes from root through path (inclusive). Useful for
 *  rendering the move list when a sub-path is highlighted. */
export function nodesOnPath(root: RootNode, path: Path): AnyNode[] {
  const out: AnyNode[] = [root];
  let node: AnyNode = root;
  let rest = path;
  while (rest.length >= 2) {
    const id = head(rest)!;
    const child: MoveNode | undefined = node.children.find((c) => c.id === id);
    if (!child) break;
    out.push(child);
    node = child;
    rest = tail(rest);
  }
  return out;
}

/** Mainline: follow the first child at every level. */
export function mainlinePath(root: RootNode): Path {
  let path: Path = ROOT_PATH;
  let node: AnyNode = root;
  while (node.children.length > 0) {
    const next: MoveNode = node.children[0];
    path = append(path, next.id);
    node = next;
  }
  return path;
}

/** Check if the given path is on the mainline. */
export function isOnMainline(root: RootNode, path: Path): boolean {
  const mainline = mainlinePath(root);
  // Check if path is a prefix of mainline or equals mainline
  return mainline.startsWith(path) || path.startsWith(mainline);
}

/**
 * Add a child move to the node at `path`. If a child with the same UCI
 * already exists, returns its existing path (no mutation). Otherwise
 * creates a new ChildNode and returns its path.
 *
 * The `data` argument is everything except `id` and `children`.
 */
export function addChild(
  root: RootNode,
  parentPath: Path,
  data: Omit<MoveNode, 'id' | 'children'>,
): { root: RootNode; path: Path; created: boolean } {
  const parentNode = nodeAtPath(root, parentPath);
  if (!parentNode) throw new Error(`addChild: invalid parent path "${parentPath}"`);

  // Already exists? Don't duplicate — just navigate.
  const existing = parentNode.children.find((c) => c.uci === data.uci);
  if (existing) {
    return { root, path: append(parentPath, existing.id), created: false };
  }

  const taken = new Set(parentNode.children.map((c) => c.id));
  const id = generateId(taken);
  const newChild: MoveNode = { ...data, id, children: [] };

  // Immutable update along the path.
  const newRoot = updateAtPath(root, parentPath, (n) => ({
    ...n,
    children: [...n.children, newChild],
  }));

  return { root: newRoot, path: append(parentPath, id), created: true };
}

/** Apply `f` to the node at `path`, returning a new tree with the change. */
export function updateAtPath(
  root: RootNode,
  path: Path,
  f: (node: AnyNode) => AnyNode,
): RootNode {
  if (path === ROOT_PATH) {
    const updated = f(root) as RootNode;
    return updated;
  }
  const id = head(path)!;
  const idx = root.children.findIndex((c) => c.id === id);
  if (idx < 0) return root;
  const newChildren = root.children.slice();
  newChildren[idx] = updateChild(newChildren[idx], tail(path), f) as MoveNode;
  return { ...root, children: newChildren };
}

function updateChild(
  child: MoveNode,
  path: Path,
  f: (node: AnyNode) => AnyNode,
): MoveNode {
  if (path === ROOT_PATH) {
    return f(child) as MoveNode;
  }
  const id = head(path)!;
  const idx = child.children.findIndex((c) => c.id === id);
  if (idx < 0) return child;
  const newChildren = child.children.slice();
  newChildren[idx] = updateChild(newChildren[idx], tail(path), f);
  return { ...child, children: newChildren };
}

/** Return the path one step deeper along the mainline of the node at `path`,
 *  or `undefined` if there are no children (we're at a leaf). */
export function nextPath(root: RootNode, path: Path): Path | undefined {
  const node = nodeAtPath(root, path);
  if (!node || node.children.length === 0) return undefined;
  return append(path, node.children[0].id);
}

/** Return the parent path, or undefined when already at the root. */
export function prevPath(path: Path): Path | undefined {
  if (path === ROOT_PATH) return undefined;
  return parent(path);
}

/** Last path along the current variation: keep following the first child
 *  from the node at `path`. */
export function endOfVariation(root: RootNode, path: Path): Path {
  let cur = path;
  let node = nodeAtPath(root, cur);
  while (node && node.children.length > 0) {
    cur = append(cur, node.children[0].id);
    node = nodeAtPath(root, cur);
  }
  return cur;
}

/** Delete the variation rooted at `path`. The root itself cannot be deleted. */
export function deleteAtPath(root: RootNode, path: Path): RootNode {
  if (path === ROOT_PATH) return root;
  const parentP = parent(path);
  const id = path.slice(-2);
  return updateAtPath(root, parentP, (n) => ({
    ...n,
    children: n.children.filter((c) => c.id !== id),
  }));
}

/** Promote the variation at `path` by one slot toward index 0 within its
 *  siblings. Promoting an already-mainline node is a no-op. */
export function promoteVariation(root: RootNode, path: Path): RootNode {
  if (path === ROOT_PATH) return root;
  const parentP = parent(path);
  const id = path.slice(-2);
  return updateAtPath(root, parentP, (n) => {
    const idx = n.children.findIndex((c) => c.id === id);
    if (idx <= 0) return n;
    const reordered = n.children.slice();
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    return { ...n, children: reordered };
  });
}

/** Promote all the way to mainline (index 0) at every level above the node. */
export function promoteToMainline(root: RootNode, path: Path): RootNode {
  let working = root;
  let cursor = path;
  while (cursor !== ROOT_PATH) {
    const parentP = parent(cursor);
    const id = cursor.slice(-2);
    working = updateAtPath(working, parentP, (n) => {
      const idx = n.children.findIndex((c) => c.id === id);
      if (idx <= 0) return n;
      const reordered = [n.children[idx], ...n.children.filter((_, i) => i !== idx)];
      return { ...n, children: reordered };
    });
    cursor = parentP;
  }
  return working;
}

/**
 * Return the most recent remaining clock for each side along `path`.
 * Only nodes that have `clockMs` set contribute. Returns `undefined` for
 * a side if no clock data is present for that side on the path.
 */
export function clocksAtPath(
  root: RootNode,
  path: Path,
): { white: number | undefined; black: number | undefined } {
  const nodes = nodesOnPath(root, path);
  let white: number | undefined;
  let black: number | undefined;
  // Walk from current position backward toward root (skip root at index 0)
  for (let i = nodes.length - 1; i >= 1; i--) {
    const node = nodes[i] as MoveNode;
    if (white === undefined && node.ply % 2 === 1 && node.clockMs !== undefined) {
      white = node.clockMs;
    }
    if (black === undefined && node.ply % 2 === 0 && node.clockMs !== undefined) {
      black = node.clockMs;
    }
    if (white !== undefined && black !== undefined) break;
  }

  // If a side has no known clock yet (e.g. opening position), look ahead on the
  // current mainline continuation and use the first clock annotation we find.
  if (white === undefined || black === undefined) {
    let node = nodeAtPath(root, path);
    while (node && node.children.length > 0) {
      const child = node.children[0];
      if (white === undefined && child.ply % 2 === 1 && child.clockMs !== undefined) {
        white = child.clockMs;
      }
      if (black === undefined && child.ply % 2 === 0 && child.clockMs !== undefined) {
        black = child.clockMs;
      }
      if (white !== undefined && black !== undefined) break;
      node = child;
    }
  }

  return { white, black };
}
