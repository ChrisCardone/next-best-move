import { useEffect, useState } from 'react';
import {
  fetchRecentLichessGames,
  fetchRecentChesscomGames,
  type ImportResult,
  type ImportRecentResult,
} from '../game/importGame';

type Platform = 'chesscom' | 'lichess';

interface PlatformState {
  games: ImportRecentResult[];
  loading: boolean;
  error: string | null;
}

const PLATFORMS: readonly Platform[] = ['chesscom', 'lichess'] as const;

const PLATFORM_META: Record<Platform, { label: string; icon: string }> = {
  chesscom: { label: 'Chess.com', icon: '♞' },
  lichess: { label: 'Lichess', icon: '♟' },
};

function emptyPlatformState(): PlatformState {
  return { games: [], loading: false, error: null };
}

function resultBadge(result: string, meIsWhite: boolean): {
  tone: 'win' | 'loss' | 'draw' | 'unknown';
  letter: 'W' | 'L' | 'D' | '?';
} {
  if (result === '1-0') return meIsWhite ? { tone: 'win', letter: 'W' } : { tone: 'loss', letter: 'L' };
  if (result === '0-1') return meIsWhite ? { tone: 'loss', letter: 'L' } : { tone: 'win', letter: 'W' };
  if (result === '1/2-1/2') return { tone: 'draw', letter: 'D' };
  return { tone: 'unknown', letter: '?' };
}

async function fetchRecent(platform: Platform, username: string, max: number): Promise<ImportRecentResult[]> {
  return platform === 'lichess'
    ? fetchRecentLichessGames(username, max)
    : fetchRecentChesscomGames(username, max);
}

export interface PgnImportModalProps {
  lichessUsername: string;
  chesscomUsername: string;
  onSetLichessUsername: (username: string) => void;
  onSetChesscomUsername: (username: string) => void;
  onClose: () => void;
  /** Returns true if the PGN was accepted. */
  onSubmit: (pgn: string) => boolean;
  /** Returns true if the imported game was accepted. */
  onImportRecent: (game: ImportResult) => boolean;
}

export function PgnImportModal({
  lichessUsername,
  chesscomUsername,
  onSetLichessUsername,
  onSetChesscomUsername,
  onClose,
  onSubmit,
  onImportRecent,
}: PgnImportModalProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<Platform, string>>({
    chesscom: chesscomUsername,
    lichess: lichessUsername,
  });
  const [recent, setRecent] = useState<Record<Platform, PlatformState>>({
    chesscom: emptyPlatformState(),
    lichess: emptyPlatformState(),
  });
  const [selectedRecent, setSelectedRecent] = useState<{ platform: Platform; game: ImportRecentResult } | null>(null);

  const handleSubmit = () => {
    const manualPgn = text.trim();
    if (manualPgn) {
      const ok = onSubmit(manualPgn);
      if (!ok) setError('Could not parse PGN.');
      return;
    }

    if (selectedRecent) {
      const ok = onImportRecent({ pgn: selectedRecent.game.pgn, orientation: selectedRecent.game.orientation });
      if (!ok) setError('Could not parse selected game.');
      return;
    }

    setError('Paste a PGN or select a recent game to import.');
  };

  const loadRecentForPlatform = async (platform: Platform, usernameRaw: string) => {
    const username = usernameRaw.trim();
    setRecent((prev) => ({ ...prev, [platform]: { games: prev[platform].games, loading: true, error: null } }));

    if (!username) {
      setRecent((prev) => ({ ...prev, [platform]: { games: [], loading: false, error: null } }));
      setSelectedRecent((prev) => (prev?.platform === platform ? null : prev));
      return;
    }

    try {
      const games = await fetchRecent(platform, username, 5);
      setRecent((prev) => ({ ...prev, [platform]: { games, loading: false, error: null } }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load recent games.';
      setRecent((prev) => ({ ...prev, [platform]: { games: [], loading: false, error: message } }));
      setSelectedRecent((prev) => (prev?.platform === platform ? null : prev));
    }
  };

  const refreshRecent = async () => {
    await Promise.all(PLATFORMS.map((p) => loadRecentForPlatform(p, drafts[p])));
  };

  const confirmUsernames = async () => {
    onSetChesscomUsername(drafts.chesscom.trim());
    onSetLichessUsername(drafts.lichess.trim());
    setSelectedRecent(null);
    await refreshRecent();
  };

  useEffect(() => {
    void refreshRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePickRecent = (platform: Platform, game: ImportRecentResult) => {
    setSelectedRecent({ platform, game });
    setError(null);
  };

  const anyLoading = recent.chesscom.loading || recent.lichess.loading;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h2>Import PGN</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <textarea
          className="modal__textarea"
          autoFocus
          placeholder='Paste a PGN here, e.g.&#10;&#10;1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *'
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        {error && <p className="modal__error">{error}</p>}
        {selectedRecent && (
          <p className="modal__selected">
            Selected {PLATFORM_META[selectedRecent.platform].label} game: {selectedRecent.game.white} vs {selectedRecent.game.black} ({selectedRecent.game.date})
          </p>
        )}
        <div className="modal__accounts">
          {PLATFORMS.map((platform) => (
            <label className="modal__account-row" key={`account-${platform}`}>
              <span className="modal__account-label">
                {PLATFORM_META[platform].icon} {PLATFORM_META[platform].label}
              </span>
              <input
                type="text"
                className="modal__input"
                placeholder={`${platform === 'chesscom' ? 'chess.com' : 'lichess'} username`}
                value={drafts[platform]}
                onChange={(e) => {
                  const value = e.target.value;
                  setDrafts((prev) => ({ ...prev, [platform]: value }));
                  setRecent((prev) => ({ ...prev, [platform]: { ...prev[platform], error: null } }));
                }}
              />
            </label>
          ))}
        </div>
        <div className="modal__recent">
          <div className="modal__recent-controls">
            <button
              type="button"
              className="toolbar__btn toolbar__btn--primary"
              onClick={() => void confirmUsernames()}
              title="Save usernames"
            >
              Confirm usernames
            </button>
            <button
              type="button"
              className={`toolbar__btn${anyLoading ? ' toolbar__btn--loading' : ''}`}
              onClick={() => void refreshRecent()}
              disabled={anyLoading}
              title="Refresh both recent-game lists"
            >
              {anyLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className="modal__recent-grid">
            {PLATFORMS.map((platform) => (
              <RecentPanel
                key={`panel-${platform}`}
                platform={platform}
                username={drafts[platform]}
                state={recent[platform]}
                selectedPgn={selectedRecent?.platform === platform ? selectedRecent.game.pgn : null}
                onPick={(game) => handlePickRecent(platform, game)}
              />
            ))}
          </div>
        </div>
        <footer className="modal__footer">
          <button type="button" className="toolbar__btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="toolbar__btn toolbar__btn--primary"
            onClick={handleSubmit}
            title={text.trim() ? 'Import pasted PGN' : selectedRecent ? 'Import selected game' : 'Paste a PGN or select a game first'}
          >
            Import
          </button>
        </footer>
      </div>
    </div>
  );
}

interface RecentPanelProps {
  platform: Platform;
  username: string;
  state: PlatformState;
  selectedPgn: string | null;
  onPick: (game: ImportRecentResult) => void;
}

function RecentPanel({ platform, username, state, selectedPgn, onPick }: RecentPanelProps) {
  const trimmed = username.trim();
  const meta = PLATFORM_META[platform];

  return (
    <section className="modal__recent-panel">
      <header className="modal__recent-panel-header">
        <span>{meta.icon} {meta.label}</span>
        <span className="modal__recent-user">{trimmed || 'No username set'}</span>
      </header>
      {state.error && <p className="modal__error">{state.error}</p>}
      {!state.error && !trimmed && (
        <p className="modal__hint">Enter a {meta.label} username, then confirm.</p>
      )}
      <div className="modal__recent-list" role="list">
        {state.games.map((game, idx) => (
          <RecentGameItem
            key={`${platform}-${game.date}-${idx}`}
            platform={platform}
            game={game}
            idx={idx}
            isSelected={selectedPgn === game.pgn}
            onPick={() => onPick(game)}
          />
        ))}
      </div>
    </section>
  );
}

interface RecentGameItemProps {
  platform: Platform;
  game: ImportRecentResult;
  idx: number;
  isSelected: boolean;
  onPick: () => void;
}

function RecentGameItem({ platform, game, idx, isSelected, onPick }: RecentGameItemProps) {
  const meIsWhite = game.orientation === 'white';
  const opponent = meIsWhite ? game.black : game.white;
  const color = meIsWhite ? 'White' : 'Black';
  const badge = resultBadge(game.result, meIsWhite);

  return (
    <button
      type="button"
      className={`modal__recent-item${isSelected ? ' is-selected' : ''}`}
      onClick={onPick}
      title="Select this game"
      data-platform={platform}
    >
      <span className="modal__recent-item-main">
        <span className={`modal__result-badge modal__result-badge--${badge.tone}`}>{badge.letter}</span>
        {idx + 1}. {game.date} • {color} vs {opponent || '?'}
      </span>
      <span className="modal__recent-item-sub">{game.white} vs {game.black} • {game.result}</span>
    </button>
  );
}
