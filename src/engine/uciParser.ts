/**
 * UCI `info` line parser. Returns structured PV data or null if the line
 * isn't an info-with-pv line we care about.
 *
 * Sample line:
 *   info depth 22 seldepth 30 multipv 1 score cp 35 nodes 123456 nps 1234567 time 100 pv e2e4 e7e5
 */
export interface PvLine {
  multipv: number;
  depth: number;
  /** Score in centipawns from side-to-move's perspective. Undefined if mate. */
  scoreCp?: number;
  /** Mate-in-N from side-to-move's perspective. Negative = being mated. */
  mate?: number;
  pv: string[];
  nodes?: number;
  nps?: number;
}

export function parseInfo(line: string): PvLine | null {
  if (!line.startsWith('info ')) return null;
  // Need a pv to be useful.
  const pvIdx = line.indexOf(' pv ');
  if (pvIdx < 0) return null;

  const head = line.slice(5, pvIdx).split(/\s+/);
  const pv = line.slice(pvIdx + 4).trim().split(/\s+/);

  let multipv = 1;
  let depth = 0;
  let scoreCp: number | undefined;
  let mate: number | undefined;
  let nodes: number | undefined;
  let nps: number | undefined;

  for (let i = 0; i < head.length; i++) {
    const tok = head[i];
    switch (tok) {
      case 'multipv':
        multipv = parseInt(head[++i], 10);
        break;
      case 'depth':
        depth = parseInt(head[++i], 10);
        break;
      case 'nodes':
        nodes = parseInt(head[++i], 10);
        break;
      case 'nps':
        nps = parseInt(head[++i], 10);
        break;
      case 'score': {
        const kind = head[++i];
        const val = parseInt(head[++i], 10);
        if (kind === 'cp') scoreCp = val;
        else if (kind === 'mate') mate = val;
        break;
      }
    }
  }

  return { multipv, depth, scoreCp, mate, pv, nodes, nps };
}

/**
 * Convert a side-to-move-relative score to a white-relative score.
 * Returns formatted string like "+0.35", "-1.20", "M5", "-M3".
 */
export function formatScore(line: PvLine, whiteToMove: boolean): string {
  if (line.mate !== undefined) {
    const m = whiteToMove ? line.mate : -line.mate;
    if (m > 0) return `M${m}`;
    if (m < 0) return `-M${-m}`;
    return '0';
  }
  if (line.scoreCp !== undefined) {
    const cp = whiteToMove ? line.scoreCp : -line.scoreCp;
    const v = cp / 100;
    return (v >= 0 ? '+' : '') + v.toFixed(2);
  }
  return '';
}

/**
 * White-relative score in centipawns clamped to a sensible range for the
 * eval bar. Mate scores collapse to ±1000 cp.
 */
export function whiteCp(line: PvLine, whiteToMove: boolean): number {
  if (line.mate !== undefined) {
    const m = whiteToMove ? line.mate : -line.mate;
    return m > 0 ? 1000 : -1000;
  }
  if (line.scoreCp !== undefined) {
    return whiteToMove ? line.scoreCp : -line.scoreCp;
  }
  return 0;
}
