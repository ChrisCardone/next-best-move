import { useMemo } from 'react';
import { useAnalysisStore } from '../engine/analysisStore';
import { cancelRunAnalysis } from '../engine/useRunAnalysis';
import { useGameStore } from '../game/store';
import { mainlinePath, nodesOnPath } from '../game/tree';
import type { PositionEval, PlayerStats } from '../engine/analysisStore';
import type { Path } from '../game/path';

// ---------------------------------------------------------------------------
// Advantage graph
// ---------------------------------------------------------------------------

const SVG_W = 600;
const SVG_H = 80;
const PAD_Y = 6;
const MID_Y = SVG_H / 2;

function yFor(winPct: number): number {
  // winPct=100 (white wins) → top (small y)
  // winPct=50 (equal)       → middle
  // winPct=0  (black wins)  → bottom (large y)
  return PAD_Y + ((100 - winPct) / 100) * (SVG_H - 2 * PAD_Y);
}

function xFor(i: number, n: number): number {
  if (n <= 1) return SVG_W / 2;
  return (i / (n - 1)) * SVG_W;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  blunder:    '#d0312d',
  mistake:    '#e8931f',
  inaccuracy: '#ccaa00',
};

interface AdvantageGraphProps {
  positions: PositionEval[];
  currentPly: number;
  onPlyClick: (ply: number) => void;
}

function AdvantageGraph({ positions, currentPly, onPlyClick }: AdvantageGraphProps) {
  const n = positions.length;
  if (n < 2) return null;

  const linePoints = positions
    .map((p, i) => `${xFor(i, n)},${yFor(p.whiteWinPct)}`)
    .join(' ');

  // Closed polygon: leftMid → all line points → rightMid
  // Clipped to upper half = white advantage area
  // Clipped to lower half = black advantage area
  const polygonPoints = [
    `0,${MID_Y}`,
    ...positions.map((p, i) => `${xFor(i, n)},${yFor(p.whiteWinPct)}`),
    `${SVG_W},${MID_Y}`,
  ].join(' ');

  const currentIdx = positions.findIndex((p) => p.ply === currentPly);
  const currentX = currentIdx >= 0 ? xFor(currentIdx, n) : null;

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
    onPlyClick(positions[idx].ply);
  }

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      preserveAspectRatio="none"
      className="analysis__graph"
      onClick={handleClick}
    >
      <defs>
        <clipPath id="analysis-clip-white">
          <rect x={0} y={0} width={SVG_W} height={MID_Y} />
        </clipPath>
        <clipPath id="analysis-clip-black">
          <rect x={0} y={MID_Y} width={SVG_W} height={SVG_H - MID_Y} />
        </clipPath>
      </defs>

      {/* White advantage fill */}
      <polygon
        points={polygonPoints}
        fill="rgba(230, 220, 190, 0.22)"
        clipPath="url(#analysis-clip-white)"
      />
      {/* Black advantage fill */}
      <polygon
        points={polygonPoints}
        fill="rgba(10, 10, 10, 0.45)"
        clipPath="url(#analysis-clip-black)"
      />

      {/* Centre line */}
      <line
        x1={0} y1={MID_Y} x2={SVG_W} y2={MID_Y}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={0.6}
      />

      {/* Advantage line */}
      <polyline
        points={linePoints}
        fill="none"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth={0.9}
        strokeLinejoin="round"
      />

      {/* Current position marker */}
      {currentX !== null && (
        <line
          x1={currentX} y1={0} x2={currentX} y2={SVG_H}
          stroke="rgba(255, 200, 60, 0.7)"
          strokeWidth={1.2}
        />
      )}

      {/* Classification markers */}
      {positions.slice(1).map((pos, i) => {
        const realIdx = i + 1;
        const color = pos.classification ? CLASSIFICATION_COLORS[pos.classification] : null;
        if (!color) return null;
        return (
          <circle
            key={realIdx}
            cx={xFor(realIdx, n)}
            cy={yFor(pos.whiteWinPct)}
            r={2.2}
            fill={color}
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Player stats tile
// ---------------------------------------------------------------------------

interface PlayerTileProps {
  label: string;
  side: 'white' | 'black';
  stats: PlayerStats;
}

function PlayerTile({ label, side, stats }: PlayerTileProps) {
  return (
    <div className={`analysis__player analysis__player--${side}`}>
      <div className="analysis__player-name">{label}</div>
      <div className="analysis__accuracy">{stats.accuracy}%</div>
      <div className="analysis__accuracy-label">Accuracy</div>
      <div className="analysis__acpl">ACPL: {stats.acpl}</div>
      <div className="analysis__counts">
        {stats.blunders > 0 && (
          <span className="analysis__count analysis__count--blunder">✗{stats.blunders}</span>
        )}
        {stats.mistakes > 0 && (
          <span className="analysis__count analysis__count--mistake">!{stats.mistakes}</span>
        )}
        {stats.inaccuracies > 0 && (
          <span className="analysis__count analysis__count--inaccuracy">?{stats.inaccuracies}</span>
        )}
        {stats.blunders === 0 && stats.mistakes === 0 && stats.inaccuracies === 0 && (
          <span className="analysis__count analysis__count--clean">✓</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function AnalysisPanel() {
  const status   = useAnalysisStore((s) => s.status);
  const progress = useAnalysisStore((s) => s.progress);
  const total    = useAnalysisStore((s) => s.total);
  const positions = useAnalysisStore((s) => s.positions);
  const white    = useAnalysisStore((s) => s.white);
  const black    = useAnalysisStore((s) => s.black);

  const root        = useGameStore((s) => s.root);
  const path        = useGameStore((s) => s.path);
  const goTo        = useGameStore((s) => s.goTo);
  const whitePlayer = useGameStore((s) => s.whitePlayer);
  const blackPlayer = useGameStore((s) => s.blackPlayer);

  const currentPly = useMemo(() => {
    const nodes = nodesOnPath(root, path);
    const last = nodes[nodes.length - 1];
    return last?.ply ?? 0;
  }, [root, path]);

  const mainPath = useMemo(() => mainlinePath(root), [root]);

  function handlePlyClick(ply: number) {
    // Slice the main path to the target ply (each path segment = 2 chars).
    goTo(mainPath.slice(0, ply * 2) as Path);
  }

  const progressPct = total > 0 ? Math.round((progress / total) * 100) : 0;

  if (status === 'idle') {
    return (
      <div className="analysis analysis--idle">
        <p className="analysis__hint">
          Click <strong>Run Analysis</strong> in the Engine panel to analyze the main line.
        </p>
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div className="analysis analysis--running">
        <p className="analysis__progress-label">
          Analyzing position {progress + 1} of {total}…
        </p>
        <div className="analysis__progress-bar-wrap">
          <div className="analysis__progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
        <button
          type="button"
          className="analysis__cancel"
          onClick={cancelRunAnalysis}
        >
          Cancel
        </button>
      </div>
    );
  }

  // complete or cancelled — show results if we have them
  if ((status === 'complete' || status === 'cancelled') && white && black && positions.length >= 2) {
    return (
      <div className="analysis analysis--results">
        {status === 'cancelled' && (
          <p className="analysis__cancelled-note">Analysis cancelled — partial results below.</p>
        )}
        <div className="analysis__players">
          <PlayerTile
            label={whitePlayer || 'White'}
            side="white"
            stats={white}
          />
          <PlayerTile
            label={blackPlayer || 'Black'}
            side="black"
            stats={black}
          />
        </div>
        <AdvantageGraph
          positions={positions}
          currentPly={currentPly}
          onPlyClick={handlePlyClick}
        />
      </div>
    );
  }

  return (
    <div className="analysis analysis--idle">
      <p className="analysis__hint">No results yet.</p>
    </div>
  );
}
