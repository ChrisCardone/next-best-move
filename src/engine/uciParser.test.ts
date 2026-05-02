import { describe, expect, it } from 'vitest';
import { formatScore, parseInfo, whiteCp } from './uciParser';

describe('uciParser', () => {
  it('parses centipawn info lines with PV metadata', () => {
    const parsed = parseInfo('info depth 22 multipv 2 score cp -35 nodes 123 nps 456 pv e2e4 e7e5');

    expect(parsed).toEqual({
      multipv: 2,
      depth: 22,
      scoreCp: -35,
      mate: undefined,
      pv: ['e2e4', 'e7e5'],
      nodes: 123,
      nps: 456,
    });
  });

  it('parses mate scores and formats them from white perspective', () => {
    const parsed = parseInfo('info depth 12 multipv 1 score mate 3 pv h5f7');

    expect(parsed).not.toBeNull();
    expect(formatScore(parsed!, true)).toBe('M3');
    expect(formatScore(parsed!, false)).toBe('-M3');
    expect(whiteCp(parsed!, true)).toBe(1000);
  });

  it('ignores non-PV lines', () => {
    expect(parseInfo('bestmove e2e4')).toBeNull();
    expect(parseInfo('info depth 8 score cp 12')).toBeNull();
  });

  it('formats centipawn scores relative to white', () => {
    const parsed = parseInfo('info depth 8 score cp 125 pv e2e4')!;

    expect(formatScore(parsed, true)).toBe('+1.25');
    expect(formatScore(parsed, false)).toBe('-1.25');
    expect(whiteCp(parsed, false)).toBe(-125);
  });
});