import { useEffect } from 'react';
import { useGameStore } from '../game/store';

/**
 * Global keyboard shortcuts. Mounted once at the app root.
 * Skips when focus is in an editable element so users can type into
 * inputs without moves changing under them.
 */
export function useKeyboardShortcuts() {
  const goFirst = useGameStore((s) => s.goFirst);
  const goPrev = useGameStore((s) => s.goPrev);
  const goNext = useGameStore((s) => s.goNext);
  const goLast = useGameStore((s) => s.goLast);
  const flip = useGameStore((s) => s.flip);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          goPrev();
          e.preventDefault();
          break;
        case 'ArrowRight':
          goNext();
          e.preventDefault();
          break;
        case 'ArrowUp':
          goFirst();
          e.preventDefault();
          break;
        case 'ArrowDown':
          goLast();
          e.preventDefault();
          break;
        case 'f':
        case 'F':
          flip();
          e.preventDefault();
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goFirst, goPrev, goNext, goLast, flip]);
}
