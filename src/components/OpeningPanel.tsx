import { useMemo } from 'react';
import { useGameStore } from '../game/store';
import { nodesOnPath, type MoveNode } from '../game/tree';
import { useOpeningWiki } from '../opening/useOpeningWiki';
import { useOpeningStore } from '../opening/openingStore';

function isMoveNode(node: unknown): node is MoveNode {
  return typeof node === 'object' && node !== null && 'san' in node && 'ply' in node;
}

export function OpeningPanel() {
  const root = useGameStore((s) => s.root);
  const path = useGameStore((s) => s.path);
  const showWiki = useOpeningStore((s) => s.showWiki);
  const toggleShowWiki = useOpeningStore((s) => s.toggleShowWiki);

  const moveNodes = useMemo(
    () => nodesOnPath(root, path).slice(1).filter(isMoveNode),
    [root, path],
  );

  const { data, loading, error } = useOpeningWiki(moveNodes, { enabled: showWiki });

  return (
    <div className="opening-panel">
      <header className="opening-panel__header">
        <span className="opening-panel__source">WikiBooks</span>
        <button
          type="button"
          className={`opening-panel__toggle${showWiki ? ' is-active' : ''}`}
          onClick={toggleShowWiki}
          aria-pressed={showWiki}
          title={showWiki ? 'Hide opening wiki text' : 'Show opening wiki text'}
        >
          {showWiki ? 'On' : 'Off'}
        </button>
      </header>

      {!showWiki && (
        <div className="opening-panel__empty">Opening wiki is hidden. Toggle it on to load position theory.</div>
      )}

      {showWiki && moveNodes.length === 0 && (
        <div className="opening-panel__empty">Play moves to load opening theory for the current position.</div>
      )}

      {showWiki && loading && <div className="opening-panel__loading">Loading opening theory...</div>}
      {showWiki && error && <div className="opening-panel__error">{error}</div>}

      {showWiki && data?.status === 'missing' && !loading && !error && (
        <div className="opening-panel__empty">No WikiBooks article found for this exact opening path.</div>
      )}

      {showWiki && data?.status === 'skipped' && !loading && !error && (
        <div className="opening-panel__empty">Opening path too long to query reliably.</div>
      )}

      {showWiki && data?.status === 'ok' && data.html && (
        <>
          <div className="opening-panel__content" dangerouslySetInnerHTML={{ __html: data.html }} />
          <div className="opening-panel__meta">
            Source: <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">{data.title}</a>
          </div>
        </>
      )}
    </div>
  );
}
