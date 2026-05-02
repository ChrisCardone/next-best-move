import { describe, expect, it } from 'vitest';
import { pgnToTree } from './pgn';

describe('pgnToTree', () => {
  it('parses headers, moves, comments, NAGs, and clock annotations', () => {
    const result = pgnToTree(`
[White "Alice"]
[Black "Bob"]
[WhiteElo "1600"]
[BlackElo "1700"]

1. e4 $1 {[%clk 0:05:00] strong start} e5 {[%clk 0:04:59.5]} 2. Nf3 *
`);

    expect(result).toBeDefined();
    expect(result?.white).toBe('Alice');
    expect(result?.black).toBe('Bob');
    expect(result?.whiteElo).toBe(1600);
    expect(result?.blackElo).toBe(1700);

    const e4 = result!.root.children[0];
    const e5 = e4.children[0];

    expect(e4).toMatchObject({ san: 'e4', uci: 'e2e4', ply: 1, clockMs: 300000 });
    expect(e4.comments).toEqual(['strong start']);
    expect(e4.nags).toEqual([1]);
    expect(e5).toMatchObject({ san: 'e5', uci: 'e7e5', ply: 2, clockMs: 299500 });
    expect(e5.comments).toBeUndefined();
  });

  it('preserves root-level variations as sibling children', () => {
    const result = pgnToTree('1. e4 (1. d4) e5 *');

    expect(result?.root.children.map((child) => child.san)).toEqual(['e4', 'd4']);
    expect(result?.root.children[0].children[0].san).toBe('e5');
  });

  it('returns undefined for empty PGN input', () => {
    expect(pgnToTree('')).toBeUndefined();
  });
});