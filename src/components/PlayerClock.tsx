import { useGameStore } from '../game/store';
import { clocksAtPath } from '../game/tree';

function formatClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface PlayerClockProps {
  side: 'white' | 'black';
}

export function PlayerClock({ side }: PlayerClockProps) {
  const root = useGameStore((s) => s.root);
  const path = useGameStore((s) => s.path);
  const whitePlayer = useGameStore((s) => s.whitePlayer);
  const blackPlayer = useGameStore((s) => s.blackPlayer);
  const whiteElo = useGameStore((s) => s.whiteElo);
  const blackElo = useGameStore((s) => s.blackElo);

  const clocks = clocksAtPath(root, path);
  const ms = side === 'white' ? clocks.white : clocks.black;
  const name = side === 'white' ? whitePlayer : blackPlayer;
  const elo = side === 'white' ? whiteElo : blackElo;

  if (!name && ms === undefined) return null;

  const pieceIcon = side === 'white' ? '\u2659' : '\u265F';
  const clockIcon = '⏱';

  return (
    <div className={`player-clock player-clock--${side}`}>
      <div className={`player-clock__avatar player-clock__avatar--${side}`}>
        {pieceIcon}
      </div>
      <div className="player-clock__info">
        {name && (
          <span className="player-clock__name">
            {name}
            {elo !== undefined && (
              <span className="player-clock__elo"> ({elo})</span>
            )}
          </span>
        )}
      </div>
      {ms !== undefined && (
        <div className="player-clock__time-box">
          <span className="player-clock__icon">{clockIcon}</span>
          <span className="player-clock__time">{formatClock(ms)}</span>
        </div>
      )}
    </div>
  );
}
