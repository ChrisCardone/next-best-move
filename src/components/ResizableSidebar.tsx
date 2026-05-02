import { useRef, useState, useCallback, ReactNode } from 'react';

interface ResizableSidebarProps {
  panels: ReactNode[];
}

export function ResizableSidebar({ panels }: ResizableSidebarProps) {
  const [sizes, setSizes] = useState<number[]>(() => panels.map(() => 1));
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ index: number; startY: number; startSizes: number[] } | null>(null);

  const handleMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { index, startY: e.clientY, startSizes: [...sizes] };

      const onMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag || !containerRef.current) return;
        const containerH = containerRef.current.offsetHeight;
        const totalFlex = drag.startSizes.reduce((a, b) => a + b, 0);
        const deltaFlex = ((ev.clientY - drag.startY) / containerH) * totalFlex;
        const newSizes = [...drag.startSizes];
        newSizes[drag.index] = Math.max(0.05, drag.startSizes[drag.index] + deltaFlex);
        newSizes[drag.index + 1] = Math.max(0.05, drag.startSizes[drag.index + 1] - deltaFlex);
        setSizes(newSizes);
      };

      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [sizes],
  );

  const items: ReactNode[] = [];
  panels.forEach((panel, i) => {
    items.push(
      <div
        key={`panel-${i}`}
        className="resizable-panel"
        style={{ flexGrow: sizes[i] }}
      >
        {panel}
      </div>,
    );
    if (i < panels.length - 1) {
      items.push(
        <div
          key={`handle-${i}`}
          className="resize-handle"
          onMouseDown={(e) => handleMouseDown(i, e)}
        />,
      );
    }
  });

  return (
    <aside className="app__side" ref={containerRef}>
      {items}
    </aside>
  );
}
