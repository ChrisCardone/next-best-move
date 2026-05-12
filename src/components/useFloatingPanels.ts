import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { WorkspaceTabId } from './useWorkspace';
import { WORKSPACE_LABELS } from './useWorkspace';

const PANEL_BASE_Z = 200;

export interface FloatingPanel {
  id: WorkspaceTabId;
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
  id: WorkspaceTabId;
  offsetX: number;
  offsetY: number;
}

interface ResizeState {
  id: WorkspaceTabId;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 420;
const MIN_WIDTH = 260;
const MIN_HEIGHT = 170;

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

interface UseFloatingPanelsResult {
  panels: FloatingPanel[];
  openPanel: (id: WorkspaceTabId) => void;
  closePanel: (id: WorkspaceTabId) => void;
  bringToFront: (id: WorkspaceTabId) => void;
  handleHeaderPointerDown: (id: WorkspaceTabId, e: ReactPointerEvent<HTMLElement>) => void;
  handleResizePointerDown: (id: WorkspaceTabId, e: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Manages a set of floating, draggable, resizable panels overlaid on the
 * board area. Each panel is keyed by a workspace tab id — callers can
 * `openPanel` and `closePanel` based on user actions.
 */
export function useFloatingPanels(
  containerRef: RefObject<HTMLElement>,
): UseFloatingPanelsResult {
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const zCounterRef = useRef(PANEL_BASE_Z);
  const [containerSize, setContainerSize] = useState<ContainerSize>({ width: 0, height: 0 });
  const [panels, setPanels] = useState<FloatingPanel[]>([]);

  const bringToFront = useCallback((id: WorkspaceTabId) => {
    setPanels((prev) => {
      zCounterRef.current += 1;
      return prev.map((p) => (p.id === id ? { ...p, z: zCounterRef.current } : p));
    });
  }, []);

  const openPanel = useCallback((id: WorkspaceTabId) => {
    setPanels((prev) => {
      if (prev.find((p) => p.id === id)) return prev;
      zCounterRef.current += 1;
      // Cascade new panels so they don't all stack on top of each other.
      const offset = prev.length * 24;
      return [
        ...prev,
        {
          id,
          title: WORKSPACE_LABELS[id],
          x: 40 + offset,
          y: 40 + offset,
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
          z: zCounterRef.current,
        },
      ];
    });
  }, []);

  const closePanel = useCallback((id: WorkspaceTabId) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleHeaderPointerDown = useCallback(
    (id: WorkspaceTabId, e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const container = containerRef.current;
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
    },
    [bringToFront, containerRef, panels],
  );

  const handleResizePointerDown = useCallback(
    (id: WorkspaceTabId, e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const panel = panels.find((p) => p.id === id);
      if (!panel) return;

      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: panel.width,
        startHeight: panel.height,
      };
      bringToFront(id);
    },
    [bringToFront, panels],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const resize = resizeRef.current;
      if (resize) {
        setPanels((prev) => prev.map((panel) => {
          if (panel.id !== resize.id) return panel;
          const maxWidth = Math.max(MIN_WIDTH, containerSize.width - panel.x);
          const maxHeight = Math.max(MIN_HEIGHT, containerSize.height - panel.y);
          const nextWidth = clamp(resize.startWidth + (e.clientX - resize.startX), MIN_WIDTH, maxWidth);
          const nextHeight = clamp(resize.startHeight + (e.clientY - resize.startY), MIN_HEIGHT, maxHeight);
          return { ...panel, width: nextWidth, height: nextHeight };
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
  }, [containerRef, containerSize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      setContainerSize({ width: container.clientWidth, height: container.clientHeight });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef]);

  // Re-clamp panels into bounds whenever the container size changes.
  useEffect(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return;
    setPanels((prev) => prev.map((p) => clampPanel(p, containerSize)));
  }, [containerSize]);

  return { panels, openPanel, closePanel, bringToFront, handleHeaderPointerDown, handleResizePointerDown };
}
