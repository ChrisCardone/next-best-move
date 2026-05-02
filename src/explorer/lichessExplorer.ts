/**
 * Lichess Opening Explorer client.
 * https://lichess.org/api#tag/Opening-Explorer
 *
 * Two endpoints used:
 *   - /masters     : OTB master games database
 *   - /lichess     : Lichess players database (filtered by speed/rating)
 *
 * Results cached client-side by request key.
 */

const BASE = 'https://explorer.lichess.ovh';

export interface ExplorerMove {
  uci: string;
  san: string;
  averageRating?: number;
  white: number;
  draws: number;
  black: number;
}

export interface ExplorerOpening {
  eco: string;
  name: string;
}

export interface ExplorerGame {
  id: string;
  winner: 'white' | 'black' | null;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  year?: number;
  month?: string;
}

export interface ExplorerResponse {
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
  topGames?: ExplorerGame[];
  opening?: ExplorerOpening | null;
}

export type Speed = 'ultraBullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';
export type RatingBucket = 400 | 1000 | 1200 | 1400 | 1600 | 1800 | 2000 | 2200 | 2500;

export interface LichessOpts {
  speeds?: Speed[];
  ratings?: RatingBucket[];
}

const cache = new Map<string, Promise<ExplorerResponse>>();

// Personal Lichess API token. The explorer endpoint requires Bearer auth
// since early 2025. This token has no scopes — it's only used to identify
// requests for rate limiting. Loaded from .env.local (VITE_LICHESS_TOKEN),
// which is gitignored so the token never lands in source control.
const LICHESS_TOKEN = import.meta.env.VITE_LICHESS_TOKEN ?? '';

function cached(key: string, fetcher: () => Promise<ExplorerResponse>) {
  let p = cache.get(key);
  if (!p) {
    p = fetcher().catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, p);
  }
  return p;
}

async function getJson(url: string): Promise<ExplorerResponse> {
  const res = await fetch(url, {
    headers: LICHESS_TOKEN ? { Authorization: `Bearer ${LICHESS_TOKEN}` } : undefined,
  });
  if (!res.ok) {
    throw new Error(`Explorer ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export function fetchMasters(fen: string): Promise<ExplorerResponse> {
  const key = `m|${fen}`;
  return cached(key, () => {
    const url = `${BASE}/masters?fen=${encodeURIComponent(fen)}&topGames=5`;
    return getJson(url);
  });
}

export function fetchLichess(fen: string, opts: LichessOpts = {}): Promise<ExplorerResponse> {
  const speeds = opts.speeds ?? ['blitz', 'rapid', 'classical'];
  const ratings = opts.ratings ?? [1600, 1800, 2000, 2200, 2500];
  const key = `l|${fen}|${speeds.join(',')}|${ratings.join(',')}`;
  return cached(key, () => {
    const params = new URLSearchParams({
      fen,
      speeds: speeds.join(','),
      ratings: ratings.join(','),
      topGames: '0',
    });
    return getJson(`${BASE}/lichess?${params.toString()}`);
  });
}
