import { Board } from './components/Board';
import { MoveList } from './components/MoveList';
import { Toolbar } from './components/Toolbar';
import { EvalBar } from './components/EvalBar';
import { EngineLines } from './components/EngineLines';
import { ExplorerPanel } from './components/ExplorerPanel';
import { PlayerClock } from './components/PlayerClock';
import { ResizableSidebar } from './components/ResizableSidebar';
import { useKeyboardShortcuts } from './game/useKeyboardShortcuts';
import { useEngine } from './engine/useEngine';
import { useGameStore } from './game/store';

export function App() {
  useKeyboardShortcuts();
  useEngine();
  const orientation = useGameStore((s) => s.orientation);
  const topSide = orientation === 'white' ? 'black' : 'white';
  const bottomSide = orientation;
  return (
    <div className="app">
      <header className="app__header">
        <h1>Next Best Move</h1>
        <Toolbar />
      </header>
      <main className="app__main">
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
        <ResizableSidebar panels={[<MoveList />, <EngineLines />, <ExplorerPanel />]} />
      </main>
    </div>
  );
}
