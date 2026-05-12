import { useEffect } from 'react';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { mainlinePath, nodesOnPath } from '../game/tree';
import { useGameStore } from '../game/store';
import { useEngineStore } from './engineStore';
import { useAnalysisStore } from './analysisStore';
import type { PositionEval, PlayerStats } from './analysisStore';
import { parseInfo } from './uciParser';
import { StockfishService, preferredThreads, type SearchLimit } from './stockfish';
import {
  analyzeGameFromWhitePovEvals,
  invertScore,
  type EngineScore,
} from './accuracy';
import { cloudResultToSideToMoveScore, fetchCloudEval } from './cloudEval';

/**
 * For terminal positions (checkmate / stalemate) the engine returns
 * `bestmove (none)` with no `score` line, leaving us with null and a
 * misclassified move (e.g. the mating move scores as a blunder because
 * "after" eval falls back to {cp:0}). Detect them up-front and synthesize
 * a SIDE-TO-MOVE-relative score (matches what the engine would emit if it
 * spoke about terminal positions):
 *   - Checkmate → mate: 0 (the side to move is mated)
 *   - Stalemate → cp: 0
 *   - Otherwise → null (caller should run engine / query cloud)
 */
function terminalEval(fen: string): EngineScore | null {
  const setup = parseFen(fen);
  if (setup.isErr) return null;
  const pos = Chess.fromSetup(setup.unwrap());
  if (pos.isErr) return null;
  const chess = pos.unwrap();
  if (chess.isCheckmate()) return { mate: 0 };
  if (chess.isStalemate()) return { cp: 0 };
  return null;
}

// ---------------------------------------------------------------------------
// Worker singleton — lives only for the duration of a single analysis run
// ---------------------------------------------------------------------------

let _worker: StockfishService | null = null;
let _cancelled = false;

/**
 * Analyze a single position and resolve with its best-line eval.
 * Subscribes to the worker's output, waits for `bestmove`, then unsubscribes.
 */
function analyzePosition(
  svc: StockfishService,
  fen: string,
  multipv: number,
  limit: SearchLimit,
  hashMb: number,
  threads: number,
): Promise<EngineScore | null> {
  return new Promise((resolve) => {
    let best: EngineScore | null = null;
    let done = false;

    const unsub = svc.onLine((line) => {
      if (done) return;
      const info = parseInfo(line);
      if (info?.multipv === 1) {
        best = { cp: info.scoreCp, mate: info.mate };
      }
      if (line.startsWith('bestmove')) {
        done = true;
        unsub();
        resolve(best);
      }
    });

    svc.analyze({ fen, multipv, limit, hashMb, threads, analyseMode: true });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function startRunAnalysis(): Promise<void> {
  const store = useAnalysisStore.getState();
  if (store.status === 'running') return;

  _cancelled = false;
  _worker?.destroy();
  _worker = null;

  store.reset();
  store.setStatus('running');

  // Collect mainline nodes from the current game tree.
  const { root } = useGameStore.getState();
  const mainPath = mainlinePath(root);
  const nodes = nodesOnPath(root, mainPath); // [rootNode, move1Node, …]

  if (nodes.length < 2) {
    // No moves to analyze.
    store.setStatus('complete');
    return;
  }

  // Pull dedicated Run Analysis settings from the engine store.
  const { fullGame } = useEngineStore.getState();
  const total = nodes.length;
  store.setProgress(0, total);

  if (_cancelled) { store.setStatus('cancelled'); return; }

  _worker = new StockfishService();
  try {
    await _worker.start();
  } catch (err) {
    console.error('[analysis] worker failed to start:', err);
    _worker?.destroy();
    _worker = null;
    store.setStatus('idle');
    return;
  }
  if (_cancelled) { _worker.destroy(); _worker = null; store.setStatus('cancelled'); return; }

  // Analyze every position sequentially. If cloud-eval is enabled, query
  // the Lichess cache first; only fall back to local Stockfish on a miss
  // or when the cached depth is shallower than what we'd compute locally.
  const rawEvals: (EngineScore | null)[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (_cancelled) break;
    store.setProgress(i, total);

    let result: EngineScore | null = terminalEval(nodes[i].fen);

    if (!result && fullGame.useCloudEval) {
      const cloud = await fetchCloudEval(nodes[i].fen);
      if (cloud && cloud.depth >= fullGame.depth) {
        const whiteToMove = nodes[i].fen.split(' ')[1] === 'w';
        result = cloudResultToSideToMoveScore(cloud, whiteToMove);
      }
    }

    if (!result) {
      const limit: SearchLimit =
        fullGame.limitKind === 'nodes'
          ? { kind: 'nodes', value: fullGame.nodes }
          : { kind: 'depth', value: fullGame.depth };
      result = await analyzePosition(
        _worker,
        nodes[i].fen,
        fullGame.multiPv,
        limit,
        fullGame.hashMb,
        preferredThreads(),
      );
    }
    rawEvals.push(result);
  }

  // Destroy the worker immediately — we no longer need it.
  _worker.destroy();
  _worker = null;

  if (_cancelled) {
    store.setStatus('cancelled');
    return;
  }

  // Convert side-to-move evals (UCI) to white-POV so we can call the pure
  // analyzer. Lila stores evals white-POV by convention; we follow suit.
  // Terminal positions (`{mate: 0}` from terminalEval) are left as null —
  // the analyzer detects the mating-move pattern from the mover-POV before
  // eval and special-cases it (see analyzeGameFromWhitePovEvals).
  const whitePovEvals: (EngineScore | null)[] = rawEvals.map((ev, i) => {
    if (!ev || ev.mate === 0) return null;
    const whiteToMove = nodes[i].fen.split(' ')[1] === 'w';
    return whiteToMove ? ev : invertScore(ev);
  });

  const startsWithWhite = root.fen.split(' ')[1] !== 'b';
  const { perMove, white, black } = analyzeGameFromWhitePovEvals(whitePovEvals, startsWithWhite);

  const positions: PositionEval[] = nodes.map((node, i) => ({
    ply: node.ply,
    san: 'san' in node ? node.san : undefined,
    uci: 'uci' in node ? node.uci : undefined,
    whiteWinPct: perMove[i].whiteWinPct,
    accuracy: perMove[i].accuracy,
    classification: perMove[i].classification,
  }));

  const toPlayerStats = (s: typeof white): PlayerStats => ({
    accuracy: s.accuracy,
    acpl: s.acpl,
    blunders: s.blunders,
    mistakes: s.mistakes,
    inaccuracies: s.inaccuracies,
  });

  store.setPositions(positions);
  store.setStats(toPlayerStats(white), toPlayerStats(black));
  store.setProgress(total, total);
  store.setStatus('complete');
}

export function cancelRunAnalysis(): void {
  _cancelled = true;
  _worker?.destroy();
  _worker = null;
  if (useAnalysisStore.getState().status === 'running') {
    useAnalysisStore.getState().setStatus('cancelled');
  }
}

/** Mount once at the app root to ensure cleanup on unmount. */
export function useAnalysisCleanup(): void {
  useEffect(() => {
    return () => {
      cancelRunAnalysis();
    };
  }, []);
}
