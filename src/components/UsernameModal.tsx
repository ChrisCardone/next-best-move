import { useState } from 'react';
import { useAppStore } from '../game/appStore';

interface UsernameModalProps {
  platform: 'lichess' | 'chesscom';
  onClose: () => void;
  onSubmit: (username: string) => void;
}

export function UsernameModal({ platform, onClose, onSubmit }: UsernameModalProps) {
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
