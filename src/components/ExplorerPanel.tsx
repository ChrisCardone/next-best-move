import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useGameStore } from '../game/store';
import { useExplorerStore } from '../explorer/explorerStore';
import { useExplorer } from '../explorer/useExplorer';
import { pickBestWinningMove, winPctForSide } from '../explorer/bestMove';
import type { ExplorerMove, Speed, RatingBucket } from '../explorer/lichessExplorer';

const SPEEDS: { id: Speed; label: string; title: string }[] = [
  { id: 'ultraBullet', label: '≫', title: 'UltraBullet' },
  { id: 'bullet',      label: '•',  title: 'Bullet' },
  { id: 'blitz',       label: '⚡', title: 'Blitz' },
  { id: 'rapid',       label: '🐇', title: 'Rapid' },
  { id: 'classical',   label: '🐢', title: 'Classical' },
  { id: 'correspondence', label: '✉', title: 'Correspondence' },
];

const RATINGS: RatingBucket[] = [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
const CROWN_ICON = '\u{1F451}';
const GAMES_COUNT_FORMATTER = new Intl.NumberFormat('en', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});

function formatGamesCount(n: number): string {
  return GAMES_COUNT_FORMATTER.format(n);
}

/**
 * Opening Explorer panel. Tabs between OTB Masters and Lichess players DBs.
 * Each row shows total games, white/draw/black ratio bar, and clicking
 * the row plays that move.
 */
export function ExplorerPanel() {
  const fen = useGameStore((s) => s.currentFen());
  const playUci = useGameStore((s) => s.playUci);

  const {
    source,
    speeds,
    ratings,
    showBestMoveArrow,
    minPopularity,
    setSource,
    toggleSpeed,
    toggleRating,
    toggleBestMoveArrow,
    setBestMoveCandidate,
    setMinPopularity,
  } = useExplorerStore();
  const [showSettings, setShowSettings] = useState(false);
  const lastFenRef = useRef(fen);

  const { data, loading, error } = useExplorer(fen, source, { speeds, ratings });

  const totalGames = data ? data.white + data.draws + data.black : 0;
  const targetSide: 'white' | 'black' = fen.split(' ')[1] === 'b' ? 'black' : 'white';

  const bestMove = useMemo(
    () => (data ? pickBestWinningMove(data.moves, totalGames, targetSide, minPopularity) : null),
    [data, totalGames, targetSide, minPopularity],
  );
  const highlightedUci = source === 'lichess' && showBestMoveArrow ? bestMove?.uci ?? null : null;

  useEffect(() => {
    const changed = lastFenRef.current !== fen;
    if (!changed) return;
    lastFenRef.current = fen;
    if (showBestMoveArrow) {
      toggleBestMoveArrow();
      setBestMoveCandidate(null, null);
    }
  }, [fen, showBestMoveArrow, toggleBestMoveArrow, setBestMoveCandidate]);

  useEffect(() => {
    if (!showBestMoveArrow || source !== 'lichess') {
      setBestMoveCandidate(null, null);
      return;
    }
    if (!bestMove) {
      setBestMoveCandidate(fen, null);
      return;
    }
    setBestMoveCandidate(fen, bestMove.uci);
  }, [showBestMoveArrow, source, bestMove, fen, setBestMoveCandidate]);

  return (
    <div className="explorer">
      <header className="explorer__header">
        <div className="explorer__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={source === 'masters'}
            className={`explorer__tab ${source === 'masters' ? 'is-active' : ''}`}
            onClick={() => setSource('masters')}
          >
            Masters
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={source === 'lichess'}
            className={`explorer__tab ${source === 'lichess' ? 'is-active' : ''}`}
            onClick={() => setSource('lichess')}
          >
            Lichess
          </button>
        </div>
        {source === 'lichess' && (
          <button
            type="button"
            className={`explorer__best${showBestMoveArrow ? ' is-active' : ''}`}
            title="Show winning move arrow (min 5% play rate)"
            aria-label="Toggle winning move arrow"
            onClick={toggleBestMoveArrow}
          >
            {CROWN_ICON}
          </button>
        )}
        {source === 'lichess' && (
          <div className="explorer__header-actions">
            <button
              type="button"
              className={`explorer__gear${showSettings ? ' is-active' : ''}`}
              title="Explorer settings"
              onClick={() => setShowSettings((v) => !v)}
            >
              ⚙
            </button>
          </div>
        )}
      </header>

      {data?.opening && (
        <div className="explorer__opening" title={data.opening.name}>
          {data.opening.eco} {data.opening.name}
        </div>
      )}

      {source === 'lichess' && showSettings && (
        <div className="explorer__settings">
          <div className="explorer__settings-section">
            <span className="explorer__settings-label">Time control</span>
            <div className="explorer__filter-row">
              {SPEEDS.map(({ id, label, title }) => (
                <button
                  key={id}
                  type="button"
                  title={title}
                  className={`explorer__filter-btn${speeds.includes(id) ? ' is-active' : ''}`}
                  onClick={() => toggleSpeed(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="explorer__settings-section">
            <span className="explorer__settings-label">Average rating</span>
            <div className="explorer__filter-row">
              {RATINGS.map((r) => (
                <button
                  key={r}
                  type="button"
                  title={String(r)}
                  className={`explorer__filter-btn${ratings.includes(r) ? ' is-active' : ''}`}
                  onClick={() => toggleRating(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="explorer__settings-section">
            <label className="explorer__settings-label" htmlFor="explorer-min-pop">
              Min. popularity — {minPopularity}%
            </label>
            <input
              id="explorer-min-pop"
              type="range"
              min={1}
              max={50}
              step={1}
              value={minPopularity}
              onChange={(e) => setMinPopularity(Number(e.target.value))}
              className="explorer__slider"
            />
          </div>
        </div>
      )}

      {error && <div className="explorer__error">{error}</div>}
      {data && data.moves.length === 0 && !loading && (
        <div className="explorer__empty">No games found.</div>
      )}

      {data && data.moves.length > 0 && (
        <>
          {source === 'lichess' && showBestMoveArrow && (
            <div className="explorer__hint">
              {bestMove
                ? (() => {
                    const total = bestMove.white + bestMove.draws + bestMove.black;
                    const popularity = totalGames > 0 ? Math.round((total / totalGames) * 100) : 0;
                    return `${bestMove.san} — ${Math.round(winPctForSide(bestMove, targetSide) * 100)}% ${targetSide} wins · ${popularity}% of games`;
                  })()
                : `No move played in ≥${minPopularity}% of games at this position.`}
            </div>
          )}
          <table className="explorer__table">
          <thead>
            <tr>
              <th className="col-move">Move</th>
              <th className="col-games">Games</th>
              <th className="col-results">Results</th>
            </tr>
          </thead>
          <tbody>
            {data.moves.map((m) => (
              <ExplorerRow
                key={m.uci}
                kind="move"
                move={m}
                totalAll={totalGames}
                highlighted={m.uci === highlightedUci}
                onPlay={() => playUci(m.uci)}
              />
            ))}
            <ExplorerRow
              kind="summary"
              white={data.white}
              draws={data.draws}
              black={data.black}
            />
          </tbody>
          </table>
        </>
      )}
    </div>
  );
}

interface ResultsBarProps {
  white: number;
  draws: number;
  black: number;
}

function ResultsBar({ white, draws, black }: ResultsBarProps) {
  const total = white + draws + black;
  const wPct = total > 0 ? (white / total) * 100 : 0;
  const dPct = total > 0 ? (draws / total) * 100 : 0;
  const bPct = total > 0 ? (black / total) * 100 : 0;
  return (
    <div className="explorer__bar" title={`W ${wPct.toFixed(0)}% / D ${dPct.toFixed(0)}% / B ${bPct.toFixed(0)}%`}>
      {wPct > 0 && (
        <span className="explorer__bar-w" style={{ width: `${wPct}%` }}>
          {wPct >= 12 ? `${Math.round(wPct)}%` : ''}
        </span>
      )}
      {dPct > 0 && (
        <span className="explorer__bar-d" style={{ width: `${dPct}%` }}>
          {dPct >= 12 ? `${Math.round(dPct)}%` : ''}
        </span>
      )}
      {bPct > 0 && (
        <span className="explorer__bar-b" style={{ width: `${bPct}%` }}>
          {bPct >= 12 ? `${Math.round(bPct)}%` : ''}
        </span>
      )}
    </div>
  );
}

type ExplorerRowProps =
  | {
      kind: 'move';
      move: ExplorerMove;
      totalAll: number;
      highlighted?: boolean;
      onPlay: () => void;
    }
  | {
      kind: 'summary';
      white: number;
      draws: number;
      black: number;
    };

function ExplorerRow(props: ExplorerRowProps) {
  if (props.kind === 'summary') {
    const total = props.white + props.draws + props.black;
    return (
      <tr className="explorer__row explorer__row--summary" aria-label="Total games summary">
        <td className="col-move">
          <span className="explorer__san">Σ</span>
        </td>
        <td className="col-games">
          <div className="explorer__games">
            <span className="explorer__games-pct">100%</span>
            <span className="explorer__games-count">{formatGamesCount(total)}</span>
          </div>
        </td>
        <td className="col-results">
          <ResultsBar white={props.white} draws={props.draws} black={props.black} />
        </td>
      </tr>
    );
  }

  const { move, totalAll, highlighted = false, onPlay } = props;
  const total = move.white + move.draws + move.black;
  const pctOfAll = totalAll > 0 ? (total / totalAll) * 100 : 0;

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onPlay();
  }

  return (
    <tr
      className={`explorer__row${highlighted ? ' explorer__row--best' : ''}`}
      onClick={onPlay}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <td className="col-move">
        <span className="explorer__san">{move.san}</span>
      </td>
      <td className="col-games">
        <div className="explorer__games">
          <span className="explorer__games-pct">{pctOfAll.toFixed(0)}%</span>
          <span className="explorer__games-count">{formatGamesCount(total)}</span>
        </div>
      </td>
      <td className="col-results">
        <ResultsBar white={move.white} draws={move.draws} black={move.black} />
      </td>
    </tr>
  );
}
