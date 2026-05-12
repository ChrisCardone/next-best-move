import { useCallback, useState } from 'react';

export type WorkspaceTabId = 'explorer' | 'opening' | 'analysis';

export const WORKSPACE_TABS: readonly WorkspaceTabId[] = ['explorer', 'analysis', 'opening'];

export const WORKSPACE_LABELS: Record<WorkspaceTabId, string> = {
  explorer: 'Explorer',
  opening: 'Opening Wiki',
  analysis: 'Analysis',
};

interface WorkspaceState {
  activeTab: WorkspaceTabId;
  poppedOut: ReadonlySet<WorkspaceTabId>;
  setActiveTab: (id: WorkspaceTabId) => void;
  popOut: (id: WorkspaceTabId) => void;
  popIn: (id: WorkspaceTabId) => void;
}

/**
 * Workspace tab state. Tracks which tab is active inside the workspace pane
 * and which tabs have been popped out into floating panels.
 *
 * Rules:
 *  - A popped-out tab is removed from the workspace tab strip.
 *  - If the active tab is popped out, the active tab falls back to the next
 *    non-popped-out tab (or the only-remaining one).
 *  - Popping a tab back in makes it the active tab.
 */
export function useWorkspace(): WorkspaceState {
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('explorer');
  const [poppedOut, setPoppedOut] = useState<ReadonlySet<WorkspaceTabId>>(() => new Set());

  const popOut = useCallback((id: WorkspaceTabId) => {
    setPoppedOut((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setActiveTab((prev) => {
      if (prev !== id) return prev;
      // Move to the next non-popped-out tab.
      const remaining = WORKSPACE_TABS.filter((t) => t !== id && !poppedOut.has(t));
      return remaining[0] ?? prev;
    });
  }, [poppedOut]);

  const popIn = useCallback((id: WorkspaceTabId) => {
    setPoppedOut((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setActiveTab(id);
  }, []);

  return { activeTab, poppedOut, setActiveTab, popOut, popIn };
}
