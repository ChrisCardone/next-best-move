import { useState } from 'react';
import { useGameStore } from '../game/store';
import { useAppStore } from '../game/appStore';
import {
  fetchLastLichessGame,
  fetchLastChesscomGame,
} from '../game/importGame';
import { PgnImportModal } from './PgnImportModal';
import { UsernameModal } from './UsernameModal';

type Platform = 'lichess' | 'chesscom';

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
  const [usernamePrompt, setUsernamePrompt] = useState<Platform | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingPlatform, setImportingPlatform] = useState<Platform | null>(null);

  const { lichessUsername, chesscomUsername, setLichessUsername, setChesscomUsername } =
    useAppStore();

  const handleImportPick = (platform: Platform) => {
    const username = platform === 'lichess' ? lichessUsername : chesscomUsername;
    if (!username) {
      setUsernamePrompt(platform);
      return;
    }
    doImport(platform, username);
  };

  const doImport = async (platform: Platform, username: string) => {
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
