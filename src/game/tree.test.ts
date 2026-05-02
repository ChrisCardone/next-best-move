import { describe, expect, it } from 'vitest';
import {
  addChild,
  clocksAtPath,
  deleteAtPath,
  endOfVariation,
  isOnMainline,
  nextPath,
  nodeAtPath,
  nodesOnPath,
  prevPath,
  promoteToMainline,
  promoteVariation,
  type RootNode,
} from './tree';

function sampleTree(): RootNode {
  return {
    fen: 'root',
    ply: 0,
    children: [
      {
        id: 'aa',
        ply: 1,
        uci: 'e2e4',
        san: 'e4',
        fen: 'after e4',
        clockMs: 300000,
        children: [
          {
            id: 'bb',
            ply: 2,
            uci: 'e7e5',
            san: 'e5',
            fen: 'after e5',
            clockMs: 299000,
            children: [],
          },
          {
            id: 'cc',
            ply: 2,
            uci: 'c7c5',
            san: 'c5',
            fen: 'after c5',
            clockMs: 298000,
            children: [],
          },
        ],
      },
      {
        id: 'dd',
        ply: 1,
        uci: 'd2d4',
        san: 'd4',
        fen: 'after d4',
        children: [],
      },
    ],
  };
}

describe('tree', () => {
  it('finds nodes and node chains by path', () => {
    const root = sampleTree();

    expect(nodeAtPath(root, 'aabb')).toMatchObject({ uci: 'e7e5' });
    expect(nodesOnPath(root, 'aacc').map((node) => node.ply)).toEqual([0, 1, 2]);
    expect(nodeAtPath(root, 'zz')).toBeUndefined();
  });

  it('navigates mainline paths', () => {
    const root = sampleTree();

    expect(nextPath(root, '')).toBe('aa');
    expect(nextPath(root, 'aa')).toBe('aabb');
    expect(prevPath('aabb')).toBe('aa');
    expect(endOfVariation(root, '')).toBe('aabb');
    expect(isOnMainline(root, 'aa')).toBe(true);
    expect(isOnMainline(root, 'aacc')).toBe(false);
  });

  it('adds new child moves immutably and reuses existing moves', () => {
    const root = sampleTree();
    const existing = addChild(root, 'aa', {
      ply: 2,
      uci: 'e7e5',
      san: 'e5',
      fen: 'after e5',
    });

    expect(existing.created).toBe(false);
    expect(existing.path).toBe('aabb');
    expect(existing.root).toBe(root);

    const created = addChild(root, 'aa', {
      ply: 2,
      uci: 'd7d5',
      san: 'd5',
      fen: 'after d5',
    });

    expect(created.created).toBe(true);
    expect(created.root).not.toBe(root);
    expect(nodeAtPath(created.root, created.path)).toMatchObject({ uci: 'd7d5' });
  });

  it('deletes and promotes variations', () => {
    const root = sampleTree();
    const deleted = deleteAtPath(root, 'aacc');
    const promoted = promoteVariation(root, 'aacc');
    const mainline = promoteToMainline(root, 'dd');

    expect(nodeAtPath(deleted, 'aacc')).toBeUndefined();
    expect(nextPath(promoted, 'aa')).toBe('aacc');
    expect(nodeAtPath(promoted, 'aacc')).toMatchObject({ uci: 'c7c5' });
    expect(nodeAtPath(mainline, 'dd')).toMatchObject({ uci: 'd2d4' });
    expect(endOfVariation(mainline, '')).toBe('dd');
  });

  it('derives clocks from current and future mainline nodes', () => {
    const root = sampleTree();

    expect(clocksAtPath(root, 'aabb')).toEqual({ white: 300000, black: 299000 });
    expect(clocksAtPath(root, '')).toEqual({ white: 300000, black: 299000 });
  });
});