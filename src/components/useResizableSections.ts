import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Manage N flex sections with drag-to-resize between adjacent pairs.
 * Sizes are stored as flex-grow weights; resizing one increases its weight
 * and decreases its right (or below) neighbor by the same amount.
 *
 * Axis defaults to vertical (sections stack top-to-bottom); pass 'horizontal'
 * to stack side-to-side.
 */
export function useResizableSections(
  initialWeights: number[],
  axis: 'vertical' | 'horizontal' = 'vertical',
) {
  const [weights, setWeights] = useState<number[]>(initialWeights);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ idx: number; start: number; startWeights: number[] } | null>(null);

  const handleHandlePointerDown = useCallback(
    (idx: number, e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || !containerRef.current) return;
      e.preventDefault();
      dragRef.current = {
        idx,
        start: axis === 'vertical' ? e.clientY : e.clientX,
        startWeights: weights.slice(),
      };

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        const container = containerRef.current;
        if (!drag || !container) return;

        const size = axis === 'vertical' ? container.clientHeight : container.clientWidth;
        if (size <= 0) return;

        const totalWeight = drag.startWeights.reduce((a, b) => a + b, 0);
        const delta = (axis === 'vertical' ? ev.clientY : ev.clientX) - drag.start;
        const deltaWeight = (delta / size) * totalWeight;

        const next = drag.startWeights.slice();
        const a = next[drag.idx] + deltaWeight;
        const b = next[drag.idx + 1] - deltaWeight;
        if (a < 0.1 || b < 0.1) return;
        next[drag.idx] = a;
        next[drag.idx + 1] = b;
        setWeights(next);
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [axis, weights],
  );

  return { weights, containerRef, handleHandlePointerDown };
}
