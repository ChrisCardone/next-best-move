import { useMemo } from 'react';
import { ExplorerPanel } from './ExplorerPanel';
import { OpeningPanel } from './OpeningPanel';
import { AnalysisPanel } from './AnalysisPanel';
import { WORKSPACE_TABS, WORKSPACE_LABELS, type WorkspaceTabId } from './useWorkspace';
import { useGameStore } from '../game/store';
import { nodesOnPath, type MoveNode } from '../game/tree';
import { useOpeningStore } from '../opening/openingStore';
import { hasOpeningWikiContent, useOpeningWiki } from '../opening/useOpeningWiki';

interface WorkspaceTabsProps {
  activeTab: WorkspaceTabId;
  poppedOut: ReadonlySet<WorkspaceTabId>;
  onSelect: (id: WorkspaceTabId) => void;
  onPopOut: (id: WorkspaceTabId) => void;
}

function isMoveNode(node: unknown): node is MoveNode {
  return typeof node === 'object' && node !== null && 'san' in node && 'ply' in node;
}

/** Hide the Opening Wiki tab when it has nothing to show for the current
 *  position (toggle off, no moves yet, or fetched data says no article). */
function useOpeningTabVisible(): boolean {
  const root = useGameStore((s) => s.root);
  const path = useGameStore((s) => s.path);
  const showWiki = useOpeningStore((s) => s.showWiki);

  const moveNodes = useMemo(
    () => nodesOnPath(root, path).slice(1).filter(isMoveNode),
    [root, path],
  );

  const state = useOpeningWiki(moveNodes, { enabled: showWiki });
  if (!showWiki || moveNodes.length === 0) return false;
  return hasOpeningWikiContent(state);
}

export function renderWorkspaceContent(tab: WorkspaceTabId) {
  if (tab === 'explorer') return <ExplorerPanel />;
  if (tab === 'opening') return <OpeningPanel />;
  return <AnalysisPanel />;
}

export function WorkspaceTabs({ activeTab, poppedOut, onSelect, onPopOut }: WorkspaceTabsProps) {
  const openingVisible = useOpeningTabVisible();
  const visibleTabs = WORKSPACE_TABS.filter((t) => {
    if (poppedOut.has(t)) return false;
    if (t === 'opening' && !openingVisible) return false;
    return true;
  });
  // If every tab is popped out, render a hint.
  const allPopped = visibleTabs.length === 0;
  const activeIsVisible = visibleTabs.includes(activeTab);
  const renderedTab = activeIsVisible ? activeTab : visibleTabs[0];

  return (
    <div className="workspace">
      <div className="workspace__tabs" role="tablist">
        {visibleTabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === renderedTab}
            className={`workspace__tab${t === renderedTab ? ' is-active' : ''}`}
            onClick={() => onSelect(t)}
          >
            {WORKSPACE_LABELS[t]}
          </button>
        ))}
        {renderedTab && (
          <button
            type="button"
            className="workspace__pop"
            title={`Pop out ${WORKSPACE_LABELS[renderedTab]} into a floating panel`}
            aria-label={`Pop out ${WORKSPACE_LABELS[renderedTab]}`}
            onClick={() => onPopOut(renderedTab)}
          >
            ↗
          </button>
        )}
      </div>
      <div className="workspace__body">
        {allPopped ? (
          <div className="workspace__empty">
            All tabs are popped out. Close a floating panel to bring it back.
          </div>
        ) : (
          renderedTab && renderWorkspaceContent(renderedTab)
        )}
      </div>
    </div>
  );
}
