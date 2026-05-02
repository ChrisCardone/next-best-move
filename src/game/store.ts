import { create } from 'zustand';
import { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import {
  addChild,
  endOfVariation,
  nextPath,
  nodeAtPath,
  prevPath,
  deleteAtPath,
  promoteVariation,
  promoteToMainline,
} from './tree';
import type { RootNode } from './tree';
import { ROOT_PATH } from './path';
import type { Path } from './path';
import { positionAtPath } from './derive';
import { defaultRoot, pgnToTree } from './pgn';

export type Orientation = 'white' | 'black';

interface GameState {
  root: RootNode;
  path: Path;
  orientation: Orientation;
  importedSide: Orientation | null;
  whitePlayer: string;
  blackPlayer: string;
  whiteElo: number | undefined;
  blackElo: number | undefined;

  // Derived helpers (recomputed on demand — cheap because tree is shallow)
  currentPosition(): Chess;
  currentFen(): string;
  lastUci(): string | undefined;

  // Actions
  playUci(uci: string): void;
  goTo(path: Path): void;
  goNext(): void;
  goPrev(): void;
  goFirst(): void;
  goLast(): void;
  flip(): void;
  setOrientation(orientation: Orientation): void;
  setImportedSide(side: Orientation | null): void;
  loadPgn(pgn: string): boolean;
  reset(): void;
  deleteVariation(path: Path): void;
  promote(path: Path, toMainline?: boolean): void;
}

export const useGameStore = create<GameState>((set, get) => ({
  root: defaultRoot(),
  path: ROOT_PATH,
  orientation: 'white',
  importedSide: null,
  whitePlayer: '',
  blackPlayer: '',
  whiteElo: undefined,
  blackElo: undefined,

  currentPosition() {
    const { root, path } = get();
    return positionAtPath(root, path);
  },
  currentFen() {
    return makeFen(get().currentPosition().toSetup());
  },
  lastUci() {
    const { root, path } = get();
    if (path === ROOT_PATH) return undefined;
    const node = nodeAtPath(root, path);
    return node && 'uci' in node ? node.uci : undefined;
  },

  playUci(uci) {
    const { root, path } = get();
    const move = parseUci(uci);
    if (!move) return;
    const pos = positionAtPath(root, path);
    if (!pos.isLegal(move)) return;

    const sanPos = pos.clone();
    const san = makeSan(sanPos, move);
    const next = pos.clone();
    next.play(move);
    const fen = makeFen(next.toSetup());

    const parent = nodeAtPath(root, path);
    const ply = (parent?.ply ?? 0) + 1;

    const result = addChild(root, path, { uci, san, fen, ply });
    set({ root: result.root, path: result.path });
  },

  goTo(path) {
    if (nodeAtPath(get().root, path)) set({ path });
  },
  goNext() {
    const { root, path } = get();
    const next = nextPath(root, path);
    if (next) set({ path: next });
  },
  goPrev() {
    const prev = prevPath(get().path);
    if (prev !== undefined) set({ path: prev });
  },
  goFirst() {
    set({ path: ROOT_PATH });
  },
  goLast() {
    const { root, path } = get();
    set({ path: endOfVariation(root, path) });
  },
  flip() {
    set((s) => ({ orientation: s.orientation === 'white' ? 'black' : 'white' }));
  },
  setOrientation(orientation) {
    set({ orientation });
  },
  setImportedSide(side) {
    set({ importedSide: side });
  },

  loadPgn(pgn) {
    const result = pgnToTree(pgn);
    if (!result) return false;
    set({ root: result.root, path: ROOT_PATH, importedSide: null, whitePlayer: result.white, blackPlayer: result.black, whiteElo: result.whiteElo, blackElo: result.blackElo });
    return true;
  },
  reset() {
    set({ root: defaultRoot(), path: ROOT_PATH, orientation: 'white', importedSide: null, whitePlayer: '', blackPlayer: '', whiteElo: undefined, blackElo: undefined });
  },

  deleteVariation(path) {
    if (path === ROOT_PATH) return;
    set((s) => {
      const newRoot = deleteAtPath(s.root, path);
      // If current path was inside the deleted subtree, fall back to its parent.
      const newPath = s.path.startsWith(path) ? path.slice(0, -2) : s.path;
      return { root: newRoot, path: newPath };
    });
  },
  promote(path, toMainline = false) {
    set((s) => ({
      root: toMainline
        ? promoteToMainline(s.root, path)
        : promoteVariation(s.root, path),
    }));
  },
}));
