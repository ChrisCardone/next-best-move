# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # tsc -b && vite build → dist/
npm run typecheck  # tsc -b --noEmit
npm test           # vitest run (all tests, non-watch)
npm run preview    # serve the production build
```

Single test file: `npx vitest run src/path/to/file.test.ts`. Watch mode: `npx vitest` (no `run`).

There is no ESLint config — TypeScript strict mode + `noUnusedLocals` / `noUnusedParameters` are the only static checks. After non-trivial edits, run `npm run typecheck` (faster than `build`).

## Environment

`VITE_LICHESS_TOKEN` is required for the opening explorer panel. Copy `.env.example` → `.env.local`. The token must have **no scopes** (the value ships in the production bundle — Vite inlines `VITE_*` at build time).

## Path alias

`@/*` → `./src/*` (declared in `tsconfig.app.json`). Use it for cross-module imports; same-module imports stay relative.

## Architecture

The app is a single-page React 18 + Zustand client. There is no backend. All chess logic runs in-browser via `chessops`, and Stockfish runs in a Web Worker loaded from `/stockfish/stockfish-18-lite-single.js` (served from `public/`, **not** bundled by Vite).

### State: five Zustand stores

The stores are deliberately separate — they have different lifetimes and different persistence rules.

- [`game/store.ts`](src/game/store.ts) — `useGameStore`: the move tree, current `path`, orientation, PGN headers. **Not persisted.** This is the source of truth for the board; everything else derives from it. `currentPosition()` and `currentFen()` are memoized at the module level keyed on `(root, path)` identity, so repeated reads inside selectors are cheap and the returned references are stable.
- [`engine/engineStore.ts`](src/engine/engineStore.ts) — `useEngineStore`: persisted engine settings — `enabled`, `showArrows`, `threatMode`, plus two nested setting buckets `interactive: { multiPv, depth, hashMb, analyseMode }` and `fullGame: { multiPv, depth, hashMb }`. **Persisted** via `zustand/middleware`. The persist config uses `version: 2` + `migrate` to convert the old flat shape (`multipv`/`analysisMultiPv`/etc.) into the nested buckets on first read.
- [`engine/enginePvStore.ts`](src/engine/enginePvStore.ts) — `useEnginePvStore`: in-memory store for live PV lines (`lines`/`threatLines` as `Map<number, PvLine>`, plus their corresponding `analyzedFen`s). **Not persisted** — `Map`s don't survive JSON, and a stale PV after reload would only confuse things.
- [`engine/analysisStore.ts`](src/engine/analysisStore.ts) — `useAnalysisStore`: the result of running engine over an entire mainline (per-ply `PositionEval`, plus per-side `PlayerStats` with Lichess-style accuracy/ACPL). **Not persisted.**
- [`game/appStore.ts`](src/game/appStore.ts), [`opening/openingStore.ts`](src/opening/openingStore.ts), [`explorer/explorerStore.ts`](src/explorer/explorerStore.ts) — small persisted UI/user-prefs stores (Lichess/Chess.com usernames, opening-wiki toggle, etc.).

### Move tree + Path

The game is an immutable tree of `MoveNode`s ([`game/tree.ts`](src/game/tree.ts)). A `Path` ([`game/path.ts`](src/game/path.ts)) is a string of concatenated 2-character node ids — `''` is root, each additional pair descends one node. This mirrors lila's analyse module; prefer the helpers (`head`, `tail`, `append`, `parent`, `nextPath`, `nodeAtPath`) over manual string slicing.

Navigation (`goNext`, `goPrev`, `goTo`) only updates the path. Position state (`Chess`, FEN, legal moves, check) is recomputed on demand from `(root, path)` via [`game/derive.ts`](src/game/derive.ts) — fast because trees are shallow.

### Engine pipeline

Two hooks drive the engine, both mounted once in [`App.tsx`](src/App.tsx):

- [`useEngine`](src/engine/useEngine.ts) — wires up two `useWorker` instances: a main worker for interactive PV display, and a threat worker (only while threat mode is enabled) that searches with the side-to-move flipped. Writes PV state to `useEnginePvStore`.
- [`useAnalysisCleanup`](src/engine/useRunAnalysis.ts) — registers an unmount cleanup for the imperative `startRunAnalysis` / `cancelRunAnalysis` API used by the Run Analysis button. The actual full-game pass lives at module scope in the same file because it owns a singleton worker.

[`useWorker`](src/engine/useWorker.ts) is the generic lifecycle hook: lazy-imports [`StockfishService`](src/engine/stockfish.ts), subscribes to UCI output, re-runs `analyze()` with a 150 ms debounce on FEN / settings change, and tears down on unmount. The main and threat engines share this hook — they differ only in `fenTransform` (identity vs. [`fenForAnalysis(_, true)`](src/engine/analysisFen.ts)) and which `useEnginePvStore` mutator the parsed lines flow into.

`StockfishService.analyze()` is **safe to call repeatedly**. If a search is in flight it sends `stop` and queues the new request to fire when `bestmove` arrives. The `searching` flag exists because UCI silently drops commands sent between `stop` and the matching `bestmove` — do not bypass the queue.

Pure Lichess-style accuracy / classification math lives in [`accuracy.ts`](src/engine/accuracy.ts) (with [`accuracy.test.ts`](src/engine/accuracy.test.ts) covering it). UCI parsing lives in [`uciParser.ts`](src/engine/uciParser.ts) (raw `info` lines → `PvLine`) and [`pvToSan.ts`](src/engine/pvToSan.ts) (UCI PV → SAN, given a starting position).

### Vite config notes

[`vite.config.ts`](vite.config.ts) intentionally does **not** set COOP/COEP. The bundled Stockfish build is the single-threaded `stockfish-18-lite-single.js`, which does not need `SharedArrayBuffer`. Adding cross-origin isolation would break fetches to `explorer.lichess.ovh` (no CORP headers there). Do not enable threaded Stockfish without solving the cross-origin fetch problem first.

`chessops` and `@lichess-org/chessground` are in `optimizeDeps.include` — their ESM exports trip the dev server's auto-discovery otherwise.

### UI layout

[`App.tsx`](src/App.tsx) is a thin shell that picks between a horizontal layout (rail right of board) and a vertical layout (rail below board) via [`useLayoutMode`](src/App.tsx) (compares `window.innerWidth` vs `innerHeight` and listens for resize).

Both layouts render the same three rail sections — **Moves**, **Engine**, and a **Workspace** tabbed pane (Explorer / Opening / Analysis). Section sizes are flex-grow weights managed by [`useResizableSections`](src/components/useResizableSections.ts), which exposes drag handles between adjacent sections. The horizontal layout stacks sections vertically; the vertical layout puts Moves + Engine in a row above a full-width Workspace.

[`useWorkspace`](src/components/useWorkspace.ts) holds the active workspace tab and the set of popped-out tabs. Clicking the ↗ icon on a tab calls [`useFloatingPanels`](src/components/useFloatingPanels.ts)`.openPanel(...)` — that hook overlays a floating, draggable, resizable copy of the panel on top of the board area. Closing the floater calls `popIn(...)` which makes it the active workspace tab again.

Styles live in `src/styles/` as SCSS partials (`_engine.scss`, `_analysis.scss`, `_opening.scss`, etc.) imported by `main.scss`, which also owns the rail/workspace/floating-panel chrome.

## Conventions worth knowing

- The codebase uses `noUnusedLocals` / `noUnusedParameters` — prefix intentionally-unused params with `_`.
- Stores expose actions as methods on the state object (not separate `useXActions` hooks). Subscribe with selectors (`useGameStore((s) => s.orientation)`) to avoid re-rendering on unrelated changes.
- Test files live next to source (`foo.ts` + `foo.test.ts`).
