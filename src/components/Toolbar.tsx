import { useEffect, useState } from 'react';
import { useGameStore } from '../game/store';
import { useAppStore } from '../game/appStore';
import {
  fetchLastLichessGame,
  fetchLastChesscomGame,
  fetchRecentLichessGames,
  fetchRecentChesscomGames,
  type ImportResult,
  type ImportRecentResult,
} from '../game/importGame';

export function Toolbar() {
  const goFirst = useGameStore((s) => s.goFirst);
  const goPrev = useGameStore((s) => s.goPrev);
  const goNext = useGameStore((s) => s.goNext);
  const goLast = useGameStore((s) => s.goLast);
  const flip = useGameStore((s) => s.flip);
  const reset = useGameStore((s) => s.reset);
  const loadPgn = useGameStore((s) => s.loadPgn);
  const setOrientation = useGameStore((s) => s.setOrientation);
  const setImportedSide = useGameStore((s) => s.setImportedSide);

  const [pgnOpen, setPgnOpen] = useState(false);
  const [usernamePrompt, setUsernamePrompt] = useState<'lichess' | 'chesscom' | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingPlatform, setImportingPlatform] = useState<'lichess' | 'chesscom' | null>(null);

  const { lichessUsername, chesscomUsername, setLichessUsername, setChesscomUsername } =
    useAppStore();

  const handleImportPick = (platform: 'lichess' | 'chesscom') => {
    const username = platform === 'lichess' ? lichessUsername : chesscomUsername;
    if (!username) {
      setUsernamePrompt(platform);
      return;
    }
    doImport(platform, username);
  };

  const doImport = async (platform: 'lichess' | 'chesscom', username: string) => {
    setImportingPlatform(platform);
    setImportError(null);
    try {
      const { pgn, orientation } =
        platform === 'lichess'
          ? await fetchLastLichessGame(username)
          : await fetchLastChesscomGame(username);
      const ok = loadPgn(pgn);
      if (ok) {
        setOrientation(orientation);
        setImportedSide(orientation);
      } else {
        setImportError('Could not parse the fetched game.');
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImportingPlatform(null);
    }
  };

  return (
    <>
      <div className="toolbar">
        <button type="button" className="toolbar__btn" onClick={goFirst} title="First move (↑)">
          ⏮
        </button>
        <button type="button" className="toolbar__btn" onClick={goPrev} title="Previous (←)">
          ◀
        </button>
        <button type="button" className="toolbar__btn" onClick={goNext} title="Next (→)">
          ▶
        </button>
        <button type="button" className="toolbar__btn" onClick={goLast} title="Last move (↓)">
          ⏭
        </button>
        <span className="toolbar__sep" />
        <button type="button" className="toolbar__btn toolbar__btn--danger" onClick={reset}>
          New
        </button>
        <button type="button" className="toolbar__btn" onClick={flip} title="Flip board (f)">
          ⇅
        </button>
        <button type="button" className="toolbar__btn" onClick={() => setPgnOpen(true)}>
          Import PGN
        </button>
        <button
          type="button"
          className={`toolbar__btn toolbar__btn--platform${importingPlatform === 'chesscom' ? ' toolbar__btn--loading' : ''}`}
          onClick={() => handleImportPick('chesscom')}
          title={
            chesscomUsername
              ? `Import last Chess.com game for ${chesscomUsername}`
              : 'Import last Chess.com game'
          }
          aria-label="Import last Chess.com game"
          disabled={importingPlatform !== null}
        >
          {importingPlatform === 'chesscom' ? '…' : '♞'}
        </button>
        <button
          type="button"
          className={`toolbar__btn toolbar__btn--platform${importingPlatform === 'lichess' ? ' toolbar__btn--loading' : ''}`}
          onClick={() => handleImportPick('lichess')}
          title={
            lichessUsername
              ? `Import last Lichess game for ${lichessUsername}`
              : 'Import last Lichess game'
          }
          aria-label="Import last Lichess game"
          disabled={importingPlatform !== null}
        >
          {importingPlatform === 'lichess' ? '…' : '♟'}
        </button>
        {importError && (
          <span className="toolbar__inline-error" title={importError}>⚠ {importError}</span>
        )}
      </div>
      {pgnOpen && (
        <PgnImportModal
          lichessUsername={lichessUsername}
          chesscomUsername={chesscomUsername}
          onSetLichessUsername={setLichessUsername}
          onSetChesscomUsername={setChesscomUsername}
          onClose={() => setPgnOpen(false)}
          onSubmit={(text) => {
            const ok = loadPgn(text);
            if (ok) setPgnOpen(false);
            return ok;
          }}
          onImportRecent={(game) => {
            const ok = loadPgn(game.pgn);
            if (ok) {
              setOrientation(game.orientation);
              setImportedSide(game.orientation);
              setPgnOpen(false);
            }
            return ok;
          }}
        />
      )}
      {usernamePrompt && (
        <UsernameModal
          platform={usernamePrompt}
          onClose={() => setUsernamePrompt(null)}
          onSubmit={(username) => {
            setUsernamePrompt(null);
            doImport(usernamePrompt, username);
          }}
        />
      )}
    </>
  );
}

interface PgnImportModalProps {
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

function PgnImportModal({
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
  const [draftChesscomUsername, setDraftChesscomUsername] = useState(chesscomUsername);
  const [draftLichessUsername, setDraftLichessUsername] = useState(lichessUsername);
  const [recentChesscomGames, setRecentChesscomGames] = useState<ImportRecentResult[]>([]);
  const [recentLichessGames, setRecentLichessGames] = useState<ImportRecentResult[]>([]);
  const [loadingRecent, setLoadingRecent] = useState({ chesscom: false, lichess: false });
  const [recentErrors, setRecentErrors] = useState<{ chesscom: string | null; lichess: string | null }>({
    chesscom: null,
    lichess: null,
  });
  const [selectedRecent, setSelectedRecent] = useState<{
    platform: 'chesscom' | 'lichess';
    game: ImportRecentResult;
  } | null>(null);

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

  const loadRecentForPlatform = async (platform: 'chesscom' | 'lichess', usernameRaw: string) => {
    const username = usernameRaw.trim();
    setLoadingRecent((prev) => ({ ...prev, [platform]: true }));
    setRecentErrors((prev) => ({ ...prev, [platform]: null }));

    if (!username) {
      if (platform === 'chesscom') setRecentChesscomGames([]);
      else setRecentLichessGames([]);
      setSelectedRecent((prev) => (prev?.platform === platform ? null : prev));
      setLoadingRecent((prev) => ({ ...prev, [platform]: false }));
      return;
    }

    try {
      const games =
        platform === 'lichess'
          ? await fetchRecentLichessGames(username, 5)
          : await fetchRecentChesscomGames(username, 5);
      if (platform === 'chesscom') setRecentChesscomGames(games);
      else setRecentLichessGames(games);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load recent games.';
      if (platform === 'chesscom') setRecentChesscomGames([]);
      else setRecentLichessGames([]);
      setSelectedRecent((prev) => (prev?.platform === platform ? null : prev));
      setRecentErrors((prev) => ({ ...prev, [platform]: message }));
    } finally {
      setLoadingRecent((prev) => ({ ...prev, [platform]: false }));
    }
  };

  const refreshRecent = async () => {
    await Promise.all([
      loadRecentForPlatform('chesscom', draftChesscomUsername),
      loadRecentForPlatform('lichess', draftLichessUsername),
    ]);
  };

  const confirmUsernames = async () => {
    onSetChesscomUsername(draftChesscomUsername.trim());
    onSetLichessUsername(draftLichessUsername.trim());
    setSelectedRecent(null);
    await refreshRecent();
  };

  useEffect(() => {
    void refreshRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePickRecent = (platform: 'chesscom' | 'lichess', game: ImportRecentResult) => {
    setSelectedRecent({ platform, game });
    setError(null);
  };

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
            Selected {selectedRecent.platform === 'chesscom' ? 'Chess.com' : 'Lichess'} game: {selectedRecent.game.white} vs {selectedRecent.game.black} ({selectedRecent.game.date})
          </p>
        )}
        <div className="modal__accounts">
          <label className="modal__account-row">
            <span className="modal__account-label">♞ Chess.com</span>
            <input
              type="text"
              className="modal__input"
              placeholder="chess.com username"
              value={draftChesscomUsername}
              onChange={(e) => {
                setDraftChesscomUsername(e.target.value);
                setRecentErrors((prev) => ({ ...prev, chesscom: null }));
              }}
            />
          </label>
          <label className="modal__account-row">
            <span className="modal__account-label">♟ Lichess</span>
            <input
              type="text"
              className="modal__input"
              placeholder="lichess username"
              value={draftLichessUsername}
              onChange={(e) => {
                setDraftLichessUsername(e.target.value);
                setRecentErrors((prev) => ({ ...prev, lichess: null }));
              }}
            />
          </label>
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
              className={`toolbar__btn${loadingRecent.chesscom || loadingRecent.lichess ? ' toolbar__btn--loading' : ''}`}
              onClick={() => void refreshRecent()}
              disabled={loadingRecent.chesscom || loadingRecent.lichess}
              title="Refresh both recent-game lists"
            >
              {loadingRecent.chesscom || loadingRecent.lichess ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className="modal__recent-grid">
            <section className="modal__recent-panel">
              <header className="modal__recent-panel-header">
                <span>♞ Chess.com</span>
                <span className="modal__recent-user">{draftChesscomUsername.trim() || 'No username set'}</span>
              </header>
              {recentErrors.chesscom && <p className="modal__error">{recentErrors.chesscom}</p>}
              {!recentErrors.chesscom && !draftChesscomUsername.trim() && (
                <p className="modal__hint">Enter a Chess.com username, then confirm.</p>
              )}
              <div className="modal__recent-list" role="list">
                {recentChesscomGames.map((game, idx) => {
                  const meIsWhite = game.orientation === 'white';
                  const opponent = meIsWhite ? game.black : game.white;
                  const color = meIsWhite ? 'White' : 'Black';
                  const isSelected =
                    selectedRecent?.platform === 'chesscom' && selectedRecent.game.pgn === game.pgn;
                  return (
                    <button
                      key={`chesscom-${game.date}-${idx}`}
                      type="button"
                      className={`modal__recent-item${isSelected ? ' is-selected' : ''}`}
                      onClick={() => handlePickRecent('chesscom', game)}
                      title="Select this game"
                    >
                      <span className="modal__recent-item-main">
                        <span className={`modal__result-badge modal__result-badge--${game.result === '1-0' ? (meIsWhite ? 'win' : 'loss') : game.result === '0-1' ? (meIsWhite ? 'loss' : 'win') : game.result === '1/2-1/2' ? 'draw' : 'unknown'}`}>
                          {game.result === '1-0' ? (meIsWhite ? 'W' : 'L') : game.result === '0-1' ? (meIsWhite ? 'L' : 'W') : game.result === '1/2-1/2' ? 'D' : '?'}
                        </span>
                        {idx + 1}. {game.date} • {color} vs {opponent || '?'}
                      </span>
                      <span className="modal__recent-item-sub">{game.white} vs {game.black} • {game.result}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="modal__recent-panel">
              <header className="modal__recent-panel-header">
                <span>♟ Lichess</span>
                <span className="modal__recent-user">{draftLichessUsername.trim() || 'No username set'}</span>
              </header>
              {recentErrors.lichess && <p className="modal__error">{recentErrors.lichess}</p>}
              {!recentErrors.lichess && !draftLichessUsername.trim() && (
                <p className="modal__hint">Enter a Lichess username, then confirm.</p>
              )}
              <div className="modal__recent-list" role="list">
                {recentLichessGames.map((game, idx) => {
                  const meIsWhite = game.orientation === 'white';
                  const opponent = meIsWhite ? game.black : game.white;
                  const color = meIsWhite ? 'White' : 'Black';
                  const isSelected =
                    selectedRecent?.platform === 'lichess' && selectedRecent.game.pgn === game.pgn;
                  return (
                    <button
                      key={`lichess-${game.date}-${idx}`}
                      type="button"
                      className={`modal__recent-item${isSelected ? ' is-selected' : ''}`}
                      onClick={() => handlePickRecent('lichess', game)}
                      title="Select this game"
                    >
                      <span className="modal__recent-item-main">
                        <span className={`modal__result-badge modal__result-badge--${game.result === '1-0' ? (meIsWhite ? 'win' : 'loss') : game.result === '0-1' ? (meIsWhite ? 'loss' : 'win') : game.result === '1/2-1/2' ? 'draw' : 'unknown'}`}>
                          {game.result === '1-0' ? (meIsWhite ? 'W' : 'L') : game.result === '0-1' ? (meIsWhite ? 'L' : 'W') : game.result === '1/2-1/2' ? 'D' : '?'}
                        </span>
                        {idx + 1}. {game.date} • {color} vs {opponent || '?'}
                      </span>
                      <span className="modal__recent-item-sub">{game.white} vs {game.black} • {game.result}</span>
                    </button>
                  );
                })}
              </div>
            </section>
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

interface UsernameModalProps {
  platform: 'lichess' | 'chesscom';
  onClose: () => void;
  onSubmit: (username: string) => void;
}

function UsernameModal({ platform, onClose, onSubmit }: UsernameModalProps) {
  const { lichessUsername, chesscomUsername, setLichessUsername, setChesscomUsername } =
    useAppStore();

  const label = platform === 'lichess' ? 'Lichess' : 'Chess.com';
  const current = platform === 'lichess' ? lichessUsername : chesscomUsername;
  const [value, setValue] = useState(current);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (platform === 'lichess') setLichessUsername(trimmed);
    else setChesscomUsername(trimmed);
    onSubmit(trimmed);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--sm" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h2>{label} username</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal__body">
          <input
            className="modal__input"
            type="text"
            autoFocus
            placeholder={`Your ${label} username`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
        <footer className="modal__footer">
          <button type="button" className="toolbar__btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="toolbar__btn toolbar__btn--primary"
            onClick={handleSubmit}
            disabled={!value.trim()}
          >
            Import last game
          </button>
        </footer>
      </div>
    </div>
  );
}
