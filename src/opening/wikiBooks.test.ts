import { describe, expect, it } from 'vitest';
import { buildWikiPathFromNodes } from './wikiBooks';
import type { MoveNode } from '../game/tree';

function makeNode(ply: number, san: string): MoveNode {
  return {
    id: 'aa',
    ply,
    uci: 'e2e4',
    san,
    fen: 'fen',
    children: [],
  };
}

describe('buildWikiPathFromNodes', () => {
  it('builds Lichess-style opening wiki path prefixes', () => {
    const nodes: MoveNode[] = [
      makeNode(1, 'e4'),
      makeNode(2, 'c5'),
      makeNode(3, 'Nf3'),
    ];

    expect(buildWikiPathFromNodes(nodes)).toBe('1._e4/1...c5/2._Nf3');
  });

  it('strips SAN punctuation characters used in annotations', () => {
    const nodes: MoveNode[] = [
      makeNode(1, 'e4!'),
      makeNode(2, 'c5?!'),
      makeNode(3, 'Bb5+'),
      makeNode(4, 'a6#'),
    ];

    expect(buildWikiPathFromNodes(nodes)).toBe('1._e4/1...c5/2._Bb5/2...a6');
  });
});
