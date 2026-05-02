/**
 * A `Path` is a string of concatenated node ids — each node id is exactly
 * 2 characters. The empty string represents the root.
 *
 * This compact representation makes equality, prefix-checks, parent and
 * sibling lookups all simple string operations. It mirrors how Lichess
 * models tree paths in lila's analyse module.
 */
export type Path = string;

export const ROOT_PATH: Path = '';

/** Two-character node id. */
export type NodeId = string;

const ID_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?';

/** Generate a deterministic-feeling 2-char id. Collisions per parent are
 *  vanishingly rare (64*64 = 4096 ids vs. the handful of children any node
 *  ever has) and resolved by retrying. */
export function generateId(taken: ReadonlySet<NodeId> = new Set()): NodeId {
  for (let attempt = 0; attempt < 128; attempt++) {
    const a = ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    const b = ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    const id = a + b;
    if (!taken.has(id)) return id;
  }
  // Theoretical fallback — should never happen.
  throw new Error('Could not allocate unique node id');
}

export function head(path: Path): NodeId | undefined {
  return path.length >= 2 ? path.slice(0, 2) : undefined;
}

export function tail(path: Path): Path {
  return path.length >= 2 ? path.slice(2) : '';
}

export function append(path: Path, id: NodeId): Path {
  return path + id;
}

export function parent(path: Path): Path {
  return path.length >= 2 ? path.slice(0, -2) : ROOT_PATH;
}
