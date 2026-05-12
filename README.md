# Next Best Move

A browser-based chess analysis tool built with React and TypeScript. Load any game, navigate through moves, analyze positions with Stockfish 18, and cross-reference against the Lichess opening explorer — all in a single page.

## Features

- **Interactive board** — Drag-and-drop moves via [Chessground](https://github.com/lichess-org/chessground). Legal move highlighting, check indicators, and smooth animations.
- **Move tree with variations** — Every move you play is stored in a branching tree. Navigate the mainline or any variation.
- **PGN import** — Paste any PGN (including headers and variations) and the tree is built automatically.
- **Recent game import** — Fetch the last games for any Lichess or Chess.com username and pick one to load directly.
- **Stockfish 18 engine** — Runs entirely in a Web Worker (no server required). Shows up to 5 principal variations with scores, mate-in-N, and search depth. Clickable moves play directly from the engine line.
- **Eval bar** — Real-time evaluation bar that tracks the white-relative advantage.
- **Engine arrows** — The top engine PVs are drawn as colored arrows on the board while analysis is running.
- **Threat mode** — A second engine runs from the opponent's perspective so you can see what they would play if it were their turn.
- **Full-game analysis** — Run Stockfish over every move in the mainline to compute Lichess-style accuracy, ACPL, and blunder / mistake / inaccuracy counts for both players, plus an interactive advantage graph.
- **Opening explorer** — Live queries against the [Lichess Opening Explorer API](https://lichess.org/api#tag/Opening-Explorer) for both the Masters (OTB) and Lichess player databases. Each move row shows total games and a W/D/B ratio bar. Clicking a row plays the move. A "best winning move" arrow highlights the highest-scoring move that meets a configurable popularity threshold.
- **Opening panel** — Inline WikiBooks "Chess Opening Theory" extract for the current move sequence.
- **Responsive layout** — Three-section rail (Moves / Engine / Workspace tabs) that auto-switches between right-of-board (horizontal monitor) and below-board with Moves+Engine side-by-side (vertical monitor). Adjacent rail sections can be resized with drag-handles.
- **Workspace tabs with pop-out** — Explorer / Opening / Analysis share a tabbed pane. Click ↗ on any tab to detach it into a floating, draggable, resizable panel over the board; close the floater to return it to a tab.
- **Keyboard navigation** — `←` / `→` step through moves, `↑` / `↓` jump to the start/end of a variation, `f` flips the board.

## Tech Stack

| Area | Library |
|---|---|
| UI framework | React 18 |
| Board rendering | `@lichess-org/chessground` |
| Chess rules & SAN | `chessops` |
| Engine | Stockfish 18 (WASM, lite single-threaded build) |
| State management | Zustand |
| Build tool | Vite 5 + TypeScript |
| Styles | SCSS |

## Project Structure

```
src/
  App.tsx                       # Root layout: board column + floating panels
  components/
    Board.tsx                   # Chessground wrapper, driven by the game store
    EvalBar.tsx                 # Vertical evaluation bar
    EngineLines.tsx             # Engine panel: toggle, PV lines, hover preview
    EngineSettingsPanel.tsx     # Gear popover: lines / depth / hash / analysis settings
    ExplorerPanel.tsx           # Opening explorer with Masters / Lichess tabs
    MoveList.tsx                # Scrollable move list with variation support
    OpeningPanel.tsx            # WikiBooks opening-theory extract
    AnalysisPanel.tsx           # Full-game accuracy / ACPL / advantage graph
    PgnImportModal.tsx          # Import-PGN dialog + recent-game picker
    UsernameModal.tsx           # Prompts for a Lichess / Chess.com username
    PvMiniBoard.tsx             # Hover popup: preview a PV on a mini board
    PlayerClock.tsx             # Per-side clock readout from PGN [%clk] data
    Toolbar.tsx                 # Navigation, flip, reset, PGN / recent imports
    useFloatingPanels.ts        # Hook owning drag / resize / layout state
  game/
    store.ts                    # Zustand store — single source of truth for board state
    tree.ts                     # Immutable move-tree data structure
    path.ts                     # Compact string-encoded tree path type
    derive.ts                   # Derive a Chess position from a path
    pgn.ts                      # PGN parser → move tree
    chess.ts                    # Chessground-compatible helpers (dests, check, etc.)
    importGame.ts               # Lichess / Chess.com recent-game fetchers
    appStore.ts                 # Persisted user prefs (Lichess / Chess.com usernames)
    useKeyboardShortcuts.ts     # Keyboard bindings
  engine/
    stockfish.ts                # Thin UCI wrapper around the Stockfish Web Worker
    engineStore.ts              # Persisted engine settings (interactive + full-game)
    enginePvStore.ts            # In-memory store for live PV lines (not persisted)
    useEngine.ts                # Mounts two `useWorker` instances (main + threat)
    useWorker.ts                # Generic worker lifecycle hook
    useRunAnalysis.ts           # Full-game analysis: runs Stockfish over every move
    accuracy.ts                 # Pure Lichess-style accuracy / classification math
    analysisStore.ts            # Per-position eval + per-side stats from a full-game run
    analysisFen.ts              # FEN tweak for threat-mode analysis
    uciParser.ts                # Parse UCI `info` lines into structured PvLine objects
    pvToSan.ts                  # Convert a UCI PV array to SAN strings
  explorer/
    lichessExplorer.ts          # Lichess Opening Explorer API client (with caching)
    explorerStore.ts            # Persisted explorer settings (source, filters, etc.)
    useExplorer.ts              # React hook wrapping the API client
    bestMove.ts                 # Pick the best-winning popular move for a side
  opening/
    wikiBooks.ts                # WikiBooks "Chess Opening Theory" client (with caching)
    openingStore.ts             # Persisted toggle for the opening-wiki panel
    useOpeningWiki.ts           # React hook wrapping the WikiBooks client
  styles/                       # Per-component SCSS partials + theme variables
public/
  stockfish/
    stockfish-18-lite-single.js # Stockfish WASM worker (served statically)
```

## Getting Started

### Prerequisites

- Node.js 18+
- A Lichess personal API token (required for the opening explorer since early 2025 — no scopes needed)

### Install & run

```bash
npm install
```

Create a `.env.local` file in the project root:

```
VITE_LICHESS_TOKEN=your_lichess_token_here
```

> **Security note:** Vite bakes `VITE_*` variables into the compiled JavaScript bundle at build time. Anyone who downloads your production build can read the token value. Use a token with **no scopes** (read-only public data access only) and never commit `.env.local` to source control.

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Build for production

```bash
npm run build   # production build → dist/
npm test        # run unit tests (Vitest)
```

Output is written to `dist/`. Because the Stockfish worker is loaded from `/stockfish/stockfish-18-lite-single.js`, serve `dist/` from a static file server that preserves the `public/` directory layout.

## How It Works

### Move Tree

The game state is modelled as an immutable tree of `MoveNode` objects (see `game/tree.ts`). Each node stores the UCI move, SAN text, resulting FEN, and an array of child nodes (variations). The active position is identified by a `Path` — a string of concatenated 2-character node IDs, the same compact format used by Lichess's analysis module.

Navigation (`goNext`, `goPrev`, `goTo`) simply updates the current path; all derived state (legal moves, turn color, check) is recomputed from the path on demand via `chessops`.

### Engine

`StockfishService` (`engine/stockfish.ts`) wraps the Stockfish Web Worker with a safe UCI command queue. The `analyze()` method is safe to call repeatedly: if a search is already in flight it sends `stop`, queues the new request, and fires it when the `bestmove` token arrives.

`useWorker` (`engine/useWorker.ts`) is the generic lifecycle hook: lazy-import the worker, subscribe to UCI output, re-analyze with a 150 ms debounce on FEN / settings change, and tear down on unmount. `useEngine` mounts it twice — once for the live PV display and once (only while threat mode is enabled) for the opponent-perspective threat eval.

Engine state lives in two stores: `engineStore.ts` holds the persisted user settings (interactive + full-game search parameters), and `enginePvStore.ts` is an in-memory store for the live PV lines (these aren't serializable as `Map`s and a stale PV after reload would only confuse things).

### Full-game analysis

`useRunAnalysis.ts` spins up a dedicated Stockfish worker, walks every position on the mainline, and stores per-position evals plus per-player stats in `analysisStore.ts`. The math — win-percent curves, accuracy formula, move classification, volatility-weighted game accuracy — lives in `engine/accuracy.ts` as pure functions and is unit-tested independently of the worker. The `AnalysisPanel` then renders a clickable advantage graph plus accuracy / ACPL / blunder tiles for each side.

### Opening Explorer

`lichessExplorer.ts` queries `https://explorer.lichess.ovh/masters` or `/lichess` with the current FEN. Responses are cached client-side by request key. `useExplorer` wraps this in a React hook that manages loading/error state and re-fetches on FEN or source changes. `bestMove.ts` picks the highest-scoring move that meets a popularity threshold (rendered as a crown-arrow on the board when enabled).

### Opening wiki

`wikiBooks.ts` builds a WikiBooks "Chess Opening Theory" URL from the current move sequence (e.g. `1._e4/1...e5/2._Nf3/...`) and fetches its HTML extract via the MediaWiki API. The HTML is sanitized and stripped of theory tables / external-link sections before being rendered inside the Opening panel. Requests are cached per move sequence.

## Third-Party Software

| Component | License | Notes |
|---|---|---|
| [Stockfish](https://github.com/official-stockfish/Stockfish) (engine logic) | GPL-3.0 | The chess engine itself |
| [stockfish.js](https://github.com/lichess-org/stockfish.js) / [stockfish-web](https://github.com/lichess-org/stockfish-web) | GPL-3.0 | WASM build of Stockfish, bundled in `public/stockfish/` |
| [Chessground](https://github.com/lichess-org/chessground) | MIT | Board rendering |
| [chessops](https://github.com/niklasf/chessops) | GPL-3.0 | Chess rules, SAN, FEN, PGN parsing |
| [React](https://github.com/facebook/react) | MIT | UI framework |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | State management |
| [Vite](https://github.com/vitejs/vite) | MIT | Build tool |

The MIT license below covers only the original source code in this repository. It does not relicense GPL-3.0 dependencies — those remain under their respective licenses.
