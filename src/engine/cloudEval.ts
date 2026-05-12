/**
 * Thin client for Lichess's cloud-eval API.
 *
 *   GET https://lichess.org/api/cloud-eval?fen=<FEN>&multiPv=<N>
 *
 * Returns deep cached evaluations (typically depth 50+, donated by users
 * running infinite analysis) for known positions. CORS is enabled so the
 * browser can call this directly.
 *
 * Coverage: openings and common middlegame positions hit; deep tactical lines
 * and rare variations miss with HTTP 404. Lichess publishes no rate limit
 * but the convention is one request at a time with backoff on 429.
 *
 * This module is side-effect-free aside from the queue state; callers decide
 * whether to use a result (depth check, mate handling, etc.).
 */
import type { EngineScore } from './accuracy';

export interface CloudEvalResult {
  /** Best-line cp from white's POV. Undefined if mate is set. */
  cp?: number;
  /** Mate-in-N from white's POV. Negative = white is being mated. */
  mate?: number;
  depth: number;
  knodes: number;
}

const ENDPOINT = 'https://lichess.org/api/cloud-eval';

let inflight: Promise<unknown> = Promise.resolve();
let cooldownUntil = 0;

/**
 * Fetch a single position from cloud-eval. Returns null on miss (404), on
 * 429 (rate-limited; caller should fall back), or on network error.
 *
 * Requests are serialised globally to be polite to the Lichess API.
 */
export async function fetchCloudEval(fen: string, signal?: AbortSignal): Promise<CloudEvalResult | null> {
  const run = inflight.then(async () => {
    if (Date.now() < cooldownUntil) return null;

    const url = `${ENDPOINT}?fen=${encodeURIComponent(fen)}&multiPv=1`;
    let res: Response;
    try {
      res = await fetch(url, { signal });
    } catch {
      return null;
    }

    if (res.status === 404) return null;
    if (res.status === 429) {
      cooldownUntil = Date.now() + 60_000;
      return null;
    }
    if (!res.ok) return null;

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return null;
    }
    return parseCloudEvalResponse(body);
  });

  inflight = run.catch(() => null);
  return run;
}

function parseCloudEvalResponse(body: unknown): CloudEvalResult | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  const pvs = obj.pvs;
  const depth = typeof obj.depth === 'number' ? obj.depth : 0;
  const knodes = typeof obj.knodes === 'number' ? obj.knodes : 0;
  if (!Array.isArray(pvs) || pvs.length === 0) return null;
  const best = pvs[0] as Record<string, unknown>;
  const cp = typeof best.cp === 'number' ? best.cp : undefined;
  const mate = typeof best.mate === 'number' ? best.mate : undefined;
  if (cp === undefined && mate === undefined) return null;
  return { cp, mate, depth, knodes };
}

/**
 * Convert a white-POV cloud result to a side-to-move EngineScore (the form
 * the local Stockfish path produces, so callers can interoperate).
 */
export function cloudResultToSideToMoveScore(result: CloudEvalResult, whiteToMove: boolean): EngineScore {
  if (result.mate !== undefined) {
    return { mate: whiteToMove ? result.mate : -result.mate };
  }
  return { cp: whiteToMove ? (result.cp ?? 0) : -(result.cp ?? 0) };
}
