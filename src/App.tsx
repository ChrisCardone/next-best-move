import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Board } from './components/Board';
import { MoveList } from './components/MoveList';
import { Toolbar } from './components/Toolbar';
import { EvalBar } from './components/EvalBar';
import { EngineLines } from './components/EngineLines';
import { ExplorerPanel } from './components/ExplorerPanel';
import { PlayerClock } from './components/PlayerClock';
import { useKeyboardShortcuts } from './game/useKeyboardShortcuts';
import { useEngine } from './engine/useEngine';
import { useGameStore } from './game/store';

// 2 × 68px clock rows + 2 × 4px gaps (matches $clock-total in _board.scss)
const CLOCK_TOTAL = 144;
const PANEL_GAP = 8;
const PANEL_WIDTH = 360;
const PANEL_MIN_HEIGHT = 170;
const PANEL_BASE_Z = 200;
const PANEL_HEIGHT_WEIGHTS: Record<PanelId, number> = {
  moves: 1.2,
  engine: 0.6,
  explorer: 1.2,
};

type PanelId = 'moves' | 'engine' | 'explorer';

interface FloatingPanel {
  id: PanelId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

interface ContainerSize {
  width: number;
  height: number;
}

interface DragState {
  id: PanelId;
  offsetX: number;
  offsetY: number;
}

interface ResizeState {
  id: PanelId;
  startY: number;
  startHeight: number;
}

const PANEL_DEFS: Array<{ id: PanelId; title: string }> = [
  { id: 'moves', title: 'Moves' },
  { id: 'engine', title: 'Engine' },
  { id: 'explorer', title: 'Explorer' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampPanel(panel: FloatingPanel, size: ContainerSize): FloatingPanel {
  return {
    ...panel,
    x: clamp(panel.x, 0, Math.max(0, size.width - panel.width)),
    y: clamp(panel.y, 0, Math.max(0, size.height - panel.height)),
  };
}

function panelWidthForContainer(size: ContainerSize): number {
  return Math.min(PANEL_WIDTH, Math.max(280, size.width - 16));
}

function buildDefaultPanels(size: ContainerSize, stackHeight: number, boardRight: number): FloatingPanel[] {
  const width = panelWidthForContainer(size);
  const maxStack = Math.max(PANEL_MIN_HEIGHT * 3 + PANEL_GAP * 2, size.height - 16);
  const desiredStack = stackHeight > 0 ? stackHeight : maxStack;
  const effectiveStack = Math.min(maxStack, desiredStack);
  const available = Math.max(0, effectiveStack - PANEL_GAP * 2);
  const totalWeight = PANEL_DEFS.reduce((sum, def) => sum + PANEL_HEIGHT_WEIGHTS[def.id], 0);
  const rawHeights = PANEL_DEFS.map((def) => (available * PANEL_HEIGHT_WEIGHTS[def.id]) / totalWeight);
  const heights = rawHeights.map((height) => Math.max(PANEL_MIN_HEIGHT, Math.floor(height)));
  let remainder = available - heights.reduce((sum, height) => sum + height, 0);

  for (let i = 0; remainder > 0; i = (i + 1) % heights.length) {
    heights[i] += 1;
    remainder -= 1;
  }

  for (let i = heights.length - 1; remainder < 0; i = (i - 1 + heights.length) % heights.length) {
    const shrinkBy = Math.min(heights[i] - 120, -remainder);
    if (shrinkBy > 0) {
      heights[i] -= shrinkBy;
      remainder += shrinkBy;
    } else {
      break;
    }
  }

  const laneLeft = Math.max(8, boardRight + 8);
  const laneRight = Math.max(laneLeft + width, size.width - 8);
  const laneWidth = Math.max(width, laneRight - laneLeft);
  const x = clamp(laneLeft + Math.round((laneWidth - width) / 2), 8, Math.max(8, size.width - width - 8));
  const y = Math.max(8, Math.round((size.height - effectiveStack) / 2));

  let runningY = y;
  return PANEL_DEFS.map((def, index) => {
    const panel: FloatingPanel = {
      id: def.id,
      title: def.title,
      x,
      y: runningY,
      width,
      height: heights[index],
      z: PANEL_BASE_Z + index + 1,
    };
    runningY += heights[index] + PANEL_GAP;
    return clampPanel(panel, size);
  });
}

export function App() {
  useKeyboardShortcuts();
  useEngine();
  const orientation = useGameStore((s) => s.orientation);
  const topSide = orientation === 'white' ? 'black' : 'white';
  const bottomSide = orientation;

  const mainRef = useRef<HTMLElement>(null);
  const boardFrameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const zCounterRef = useRef(PANEL_BASE_Z);
  const [containerSize, setContainerSize] = useState<ContainerSize>({ width: 0, height: 0 });
  const [sidebarHeight, setSidebarHeight] = useState<number | undefined>(undefined);
  const [boardLeft, setBoardLeft] = useState(0);
  const [boardRight, setBoardRight] = useState(0);
  const [boardShift, setBoardShift] = useState(0);
  const [boardReserveRight, setBoardReserveRight] = useState(0);
  const [panels, setPanels] = useState<FloatingPanel[]>([]);

  const bringToFront = useCallback((id: PanelId) => {
    setPanels((prev) => {
      zCounterRef.current += 1;
      return prev.map((p) => (p.id === id ? { ...p, z: zCounterRef.current } : p));
    });
  }, []);

  const handlePanelHeaderPointerDown = useCallback((id: PanelId, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const container = mainRef.current;
    if (!container) return;

    const panel = panels.find((p) => p.id === id);
    if (!panel) return;

    e.preventDefault();
    const rect = container.getBoundingClientRect();
    dragRef.current = {
      id,
      offsetX: e.clientX - rect.left - panel.x,
      offsetY: e.clientY - rect.top - panel.y,
    };
    bringToFront(id);
  }, [bringToFront, panels]);

  const handlePanelResizePointerDown = useCallback((id: PanelId, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const panel = panels.find((p) => p.id === id);
    if (!panel) return;

    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      id,
      startY: e.clientY,
      startHeight: panel.height,
    };
    bringToFront(id);
  }, [bringToFront, panels]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const container = mainRef.current;
      if (!container) return;

      const resize = resizeRef.current;
      if (resize) {
        setPanels((prev) => prev.map((panel) => {
          if (panel.id !== resize.id) return panel;
          const maxHeight = Math.max(PANEL_MIN_HEIGHT, containerSize.height - panel.y);
          const nextHeight = clamp(resize.startHeight + (e.clientY - resize.startY), PANEL_MIN_HEIGHT, maxHeight);
          return { ...panel, height: nextHeight };
        }));
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left - drag.offsetX;
      const y = e.clientY - rect.top - drag.offsetY;

      setPanels((prev) => prev.map((panel) => {
        if (panel.id !== drag.id) return panel;
        return clampPanel({ ...panel, x, y }, containerSize);
      }));
    };

    const onPointerUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [containerSize]);

  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      setContainerSize({ width: container.clientWidth, height: container.clientHeight });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const frame = boardFrameRef.current;
    const container = mainRef.current;
    if (!frame || !container) return;
    const ro = new ResizeObserver(() => {
      setSidebarHeight(frame.offsetHeight + CLOCK_TOTAL);
      const frameRect = frame.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setBoardLeft(frameRect.left - containerRect.left);
      setBoardRight(frameRect.right - containerRect.left);
    });
    ro.observe(frame);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (containerSize.width === 0 || containerSize.height === 0 || boardLeft === 0 || boardRight === 0) return;

    if (panels.length === 0) {
      const minLane = panelWidthForContainer(containerSize) + 16;
      const naturalLeftGap = Math.max(0, boardLeft - 8);
      const naturalRightGap = Math.max(0, containerSize.width - boardRight - 8);
      const missingLane = Math.max(0, minLane - naturalRightGap);
      const safeShift = Math.min(missingLane, naturalLeftGap);
      const neededReserve = missingLane - safeShift;
      const finalBoardRight = Math.max(0, boardRight - safeShift - neededReserve);

      setBoardShift(safeShift);
      setBoardReserveRight(neededReserve);
      const defaults = buildDefaultPanels(containerSize, sidebarHeight ?? 0, finalBoardRight);
      setPanels(defaults);
      return;
    }
    setPanels((prev) => prev.map((panel) => clampPanel(panel, containerSize)));
  }, [boardLeft, boardRight, containerSize, panels.length, sidebarHeight]);

  function renderPanelContent(id: PanelId) {
    if (id === 'moves') return <MoveList />;
    if (id === 'engine') return <EngineLines />;
    return <ExplorerPanel />;
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>Next Best Move</h1>
        <Toolbar />
      </header>
      <main className="app__main" ref={mainRef}>
        <section
          className="app__board"
          aria-label="Chess board"
          style={boardReserveRight > 0 ? { width: `calc(100% - ${boardReserveRight}px)`, marginRight: 'auto' } : undefined}
        >
          <div className="board-column" style={boardShift > 0 ? { transform: `translateX(-${boardShift}px)` } : undefined}>
            <PlayerClock side={topSide} />
            <div className="board-frame" ref={boardFrameRef}>
              <EvalBar />
              <Board />
            </div>
            <PlayerClock side={bottomSide} />
          </div>
        </section>

        <div className="floating-panels" aria-label="Draggable analysis panels">
          {panels.map((panel) => (
            <section
              key={panel.id}
              className={`floating-panel floating-panel--${panel.id}`}
              style={{
                left: panel.x,
                top: panel.y,
                width: panel.width,
                height: panel.height,
                zIndex: panel.z,
              }}
              onPointerDown={() => bringToFront(panel.id)}
            >
              <div
                className="floating-panel__header"
                onPointerDown={(e) => handlePanelHeaderPointerDown(panel.id, e)}
              >
                <span className="floating-panel__title">{panel.title}</span>
              </div>
              <div className="floating-panel__body">
                {renderPanelContent(panel.id)}
              </div>
              <button
                type="button"
                className="floating-panel__resize"
                aria-label={`Resize ${panel.title} panel height`}
                onPointerDown={(e) => handlePanelResizePointerDown(panel.id, e)}
              />
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
