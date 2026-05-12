import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnalysisStore } from '../engine/analysisStore';
import { cancelRunAnalysis, startRunAnalysis } from '../engine/useRunAnalysis';
import { useGameStore } from '../game/store';
import { mainlinePath, nodesOnPath } from '../game/tree';
import type { PositionEval, PlayerStats } from '../engine/analysisStore';
import type { Path } from '../game/path';
import { AnalysisSettingsPanel } from './AnalysisSettingsPanel';

// ---------------------------------------------------------------------------
// Advantage graph
//
// We draw the SVG at the container's actual measured size so 1 SVG unit = 1
// CSS pixel — no preserveAspectRatio stretching, no distorted stroke widths.
// ---------------------------------------------------------------------------

const PAD_Y_RATIO = 0.075; // 7.5% of height padding top + bottom

function yFor(winPct: number, h: number): number {
  const padY = h * PAD_Y_RATIO;
  return padY + ((100 - winPct) / 100) * (h - 2 * padY);
}

function xFor(i: number, n: number, w: number): number {
  if (n <= 1) return w / 2;
  return (i / (n - 1)) * w;
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 600, h: 80 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ w: rect.width, h: rect.height });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = positions.length;
  if (n < 2) return <div ref={containerRef} className="analysis__graph analysis__graph--empty" />;

  const { w, h } = size;
  const midY = h / 2;
  // Stroke widths scale lightly with height so they look right at any panel size.
  const lineW = Math.max(1, h * 0.012);
  const centreW = Math.max(0.5, h * 0.008);
  const cursorW = Math.max(1.2, h * 0.016);
  const dotR = Math.max(2, h * 0.028);

  const linePoints = positions
    .map((p, i) => `${xFor(i, n, w)},${yFor(p.whiteWinPct, h)}`)
    .join(' ');

  const polygonPoints = [
    `0,${midY}`,
    ...positions.map((p, i) => `${xFor(i, n, w)},${yFor(p.whiteWinPct, h)}`),
    `${w},${midY}`,
  ].join(' ');

  const currentIdx = positions.findIndex((p) => p.ply === currentPly);
  const currentX = currentIdx >= 0 ? xFor(currentIdx, n, w) : null;

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
    onPlyClick(positions[idx].ply);
  }

  return (
    <div ref={containerRef} className="analysis__graph">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        className="analysis__graph-svg"
        onClick={handleClick}
      >
        <defs>
          <clipPath id="analysis-clip-white">
            <rect x={0} y={0} width={w} height={midY} />
          </clipPath>
          <clipPath id="analysis-clip-black">
            <rect x={0} y={midY} width={w} height={h - midY} />
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
          x1={0} y1={midY} x2={w} y2={midY}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={centreW}
        />

        {/* Advantage line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth={lineW}
          strokeLinejoin="round"
        />

        {/* Current position marker */}
        {currentX !== null && (
          <line
            x1={currentX} y1={0} x2={currentX} y2={h}
            stroke="rgba(255, 200, 60, 0.7)"
            strokeWidth={cursorW}
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
              cx={xFor(realIdx, n, w)}
              cy={yFor(pos.whiteWinPct, h)}
              r={dotR}
              fill={color}
            />
          );
        })}
      </svg>
    </div>
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
  const mainlineLen = mainPath.length / 2;

  function handlePlyClick(ply: number) {
    // Slice the main path to the target ply (each path segment = 2 chars).
    goTo(mainPath.slice(0, ply * 2) as Path);
  }

  const progressPct = total > 0 ? Math.round((progress / total) * 100) : 0;

  if (status === 'idle') {
    const canRun = mainlineLen > 0;
    return (
      <div className="analysis analysis--idle">
        <div className="analysis__idle-card">
          <p className="analysis__idle-blurb">
            Analyse the full game with Stockfish to get per-move accuracy, ACPL, and an advantage graph.
          </p>
          <button
            type="button"
            className="analysis__run-btn"
            onClick={startRunAnalysis}
            disabled={!canRun}
          >
            Run Analysis
          </button>
          {!canRun && (
            <p className="analysis__hint">Load a game or play some moves first.</p>
          )}
        </div>
        <AnalysisSettingsPanel />
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
