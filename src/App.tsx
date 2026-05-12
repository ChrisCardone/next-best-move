import { useEffect, useRef, useState } from 'react';
import { Board } from './components/Board';
import { MoveList } from './components/MoveList';
import { Toolbar } from './components/Toolbar';
import { EvalBar } from './components/EvalBar';
import { EngineLines } from './components/EngineLines';
import { PlayerClock } from './components/PlayerClock';
import { useKeyboardShortcuts } from './game/useKeyboardShortcuts';
import { useEngine } from './engine/useEngine';
import { useAnalysisCleanup, startRunAnalysis } from './engine/useRunAnalysis';
import { useGameStore } from './game/store';
import { useEngineStore } from './engine/engineStore';
import { useAnalysisStore } from './engine/analysisStore';

// Dev-only: expose stores + actions on window so we can drive the app from
// DevTools while debugging. Stripped from production by Vite (`import.meta.env.DEV`).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__nbm__ = {
    useGameStore,
    useEngineStore,
    useAnalysisStore,
    startRunAnalysis,
  };
}
import { useResizableSections } from './components/useResizableSections';
import { useWorkspace } from './components/useWorkspace';
import { WorkspaceTabs, renderWorkspaceContent } from './components/WorkspaceTabs';
import { useFloatingPanels } from './components/useFloatingPanels';

type LayoutMode = 'horizontal' | 'vertical';

function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() =>
    typeof window !== 'undefined' && window.innerWidth >= window.innerHeight ? 'horizontal' : 'vertical',
  );

  useEffect(() => {
    const onResize = () => {
      setMode(window.innerWidth >= window.innerHeight ? 'horizontal' : 'vertical');
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return mode;
}

export function App() {
  useKeyboardShortcuts();
  useEngine();
  useAnalysisCleanup();
  const orientation = useGameStore((s) => s.orientation);
  const topSide = orientation === 'white' ? 'black' : 'white';
  const bottomSide = orientation;

  const layoutMode = useLayoutMode();
  const mainRef = useRef<HTMLElement>(null);

  const workspace = useWorkspace();
  const floats = useFloatingPanels(mainRef);

  // Rail section weights: Moves / Engine / Workspace
  const railSections = useResizableSections([1.1, 0.9, 1.4], 'vertical');
  // Vertical-layout: Moves and Engine side-by-side. Their split is one handle.
  const horizSplitWeights = useResizableSections([1, 1], 'horizontal');

  return (
    <div className={`app app--${layoutMode}`}>
      <header className="app__header">
        <h1>Next Best Move</h1>
        <Toolbar />
      </header>
      <main className="app__main" ref={mainRef}>
        <section className="app__board" aria-label="Chess board">
          <div className="board-column">
            <PlayerClock side={topSide} />
            <div className="board-frame">
              <EvalBar />
              <Board />
            </div>
            <PlayerClock side={bottomSide} />
          </div>
        </section>

        {layoutMode === 'horizontal' ? (
          <aside
            className="app__rail app__rail--vertical"
            ref={railSections.containerRef}
            aria-label="Analysis rail"
          >
            <section
              className="rail-section rail-section--moves"
              style={{ flexGrow: railSections.weights[0] }}
            >
              <RailHeader title="Moves" />
              <div className="rail-section__body">
                <MoveList />
              </div>
            </section>

            <div
              className="rail-handle rail-handle--horizontal"
              role="separator"
              aria-orientation="horizontal"
              onPointerDown={(e) => railSections.handleHandlePointerDown(0, e)}
            />

            <section
              className="rail-section rail-section--engine"
              style={{ flexGrow: railSections.weights[1] }}
            >
              <RailHeader title="Engine" />
              <div className="rail-section__body">
                <EngineLines />
              </div>
            </section>

            <div
              className="rail-handle rail-handle--horizontal"
              role="separator"
              aria-orientation="horizontal"
              onPointerDown={(e) => railSections.handleHandlePointerDown(1, e)}
            />

            <section
              className="rail-section rail-section--workspace"
              style={{ flexGrow: railSections.weights[2] }}
            >
              <div className="rail-section__body rail-section__body--flush">
                <WorkspaceTabs
                  activeTab={workspace.activeTab}
                  poppedOut={workspace.poppedOut}
                  onSelect={workspace.setActiveTab}
                  onPopOut={(id) => {
                    workspace.popOut(id);
                    floats.openPanel(id);
                  }}
                />
              </div>
            </section>
          </aside>
        ) : (
          <aside className="app__rail app__rail--below" aria-label="Analysis rail">
            <div className="rail-row" ref={horizSplitWeights.containerRef}>
              <section
                className="rail-section rail-section--moves"
                style={{ flexGrow: horizSplitWeights.weights[0] }}
              >
                <RailHeader title="Moves" />
                <div className="rail-section__body">
                  <MoveList />
                </div>
              </section>
              <div
                className="rail-handle rail-handle--vertical"
                role="separator"
                aria-orientation="vertical"
                onPointerDown={(e) => horizSplitWeights.handleHandlePointerDown(0, e)}
              />
              <section
                className="rail-section rail-section--engine"
                style={{ flexGrow: horizSplitWeights.weights[1] }}
              >
                <RailHeader title="Engine" />
                <div className="rail-section__body">
                  <EngineLines />
                </div>
              </section>
            </div>
            <section className="rail-section rail-section--workspace rail-section--workspace-below">
              <div className="rail-section__body rail-section__body--flush">
                <WorkspaceTabs
                  activeTab={workspace.activeTab}
                  poppedOut={workspace.poppedOut}
                  onSelect={workspace.setActiveTab}
                  onPopOut={(id) => {
                    workspace.popOut(id);
                    floats.openPanel(id);
                  }}
                />
              </div>
            </section>
          </aside>
        )}

        <div className="floating-panels" aria-label="Floating workspace pop-outs">
          {floats.panels.map((panel) => (
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
              onPointerDown={() => floats.bringToFront(panel.id)}
            >
              <div
                className="floating-panel__header"
                onPointerDown={(e) => floats.handleHeaderPointerDown(panel.id, e)}
              >
                <span className="floating-panel__title">{panel.title}</span>
                <button
                  type="button"
                  className="floating-panel__close"
                  title="Return to workspace tabs"
                  aria-label={`Close ${panel.title} floating panel`}
                  onClick={() => {
                    floats.closePanel(panel.id);
                    workspace.popIn(panel.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  ×
                </button>
              </div>
              <div className="floating-panel__body">
                {renderWorkspaceContent(panel.id)}
              </div>
              <button
                type="button"
                className="floating-panel__resize-corner"
                aria-label={`Resize ${panel.title} panel`}
                onPointerDown={(e) => floats.handleResizePointerDown(panel.id, e)}
              />
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

function RailHeader({ title }: { title: string }) {
  return (
    <div className="rail-section__header">
      <span className="rail-section__title">{title}</span>
    </div>
  );
}
