/**
 * Stockfish service. Picks the best available build:
 *
 *   1. Full Stockfish 17.1 (lila-stockfish-web) — multi-threaded via SAB,
 *      full NNUE, fetched from Lichess CDN. ~Lichess fishnet strength.
 *   2. Stockfish 18-lite single-threaded — embedded smaller net, no SAB
 *      required. ~300 Elo weaker, used as fallback on browsers without
 *      cross-origin isolation.
 *
 * Both expose the same UCI string interface: `analyze` accepts a FEN plus
 * search settings and emits raw UCI `info`/`bestmove` lines via `onLine`.
 */

export type SearchLimit =
  | { kind: 'depth'; value: number }
  | { kind: 'nodes'; value: number };

interface AnalyzeRequest {
  fen: string;
  multipv: number;
  limit: SearchLimit;
  hashMb: number;
  threads: number;
  analyseMode: boolean;
}

interface EngineDriver {
  start(): Promise<void>;
  send(cmd: string): void;
  destroy(): void;
}

const SF17_NNUE_BIG = {
  name: 'nn-1c0000000000.nnue',
  url: 'https://lichess1.org/assets/lifat/nnue/nn-1c0000000000.nnue',
};
const SF17_NNUE_SMALL = {
  name: 'nn-37f18f62d772.nnue',
  url: 'https://lichess1.org/assets/lifat/nnue/nn-37f18f62d772.nnue',
};

// Cache the NNUE bytes once per page load — they're ~80 MB combined and
// the HTTP layer's max-age=31536000 keeps them in disk cache across reloads.
let _bigNnue: Promise<Uint8Array> | null = null;
let _smallNnue: Promise<Uint8Array> | null = null;

async function fetchNnue(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`NNUE fetch failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function getBigNnue(): Promise<Uint8Array> {
  _bigNnue ??= fetchNnue(SF17_NNUE_BIG.url);
  return _bigNnue;
}
function getSmallNnue(): Promise<Uint8Array> {
  _smallNnue ??= fetchNnue(SF17_NNUE_SMALL.url);
  return _smallNnue;
}

function preferredThreads(): number {
  const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  if (typeof hc !== 'number' || hc < 2) return 1;
  // Leave one core for the UI.
  return Math.max(1, Math.min(8, hc - 1));
}

/**
 * Whether the page is cross-origin isolated. Multi-threaded SF needs SAB
 * which in turn needs isolation (COOP=same-origin + COEP=credentialless or
 * require-corp). If the host hasn't set the headers, fall back to lite.
 */
function canUseFullSf(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof SharedArrayBuffer === 'undefined') return false;
  // crossOriginIsolated is the canonical signal in modern browsers.
  return Boolean((window as { crossOriginIsolated?: boolean }).crossOriginIsolated);
}

// ---------------------------------------------------------------------------
// Lite driver (Stockfish 18-lite single-threaded, classic Worker postMessage)
// ---------------------------------------------------------------------------

class LiteDriver implements EngineDriver {
  private worker: Worker | null = null;
  constructor(private onLine: (s: string) => void) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker('/stockfish/stockfish-18-lite-single.js');
      } catch (err) {
        reject(err);
        return;
      }
      this.worker.onerror = (e) => reject(new Error(`Stockfish worker error: ${e.message ?? 'unknown'}`));
      this.worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : (e.data?.text ?? '');
        if (!line) return;
        if (line === 'readyok') resolve();
        this.onLine(line);
      };
      this.send('uci');
      this.send('isready');
    });
  }

  send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

// ---------------------------------------------------------------------------
// Full SF 17.1 driver (lila-stockfish-web, multi-threaded, full NNUE)
// ---------------------------------------------------------------------------

interface StockfishWebInstance {
  uci(command: string): void;
  listen: (line: string) => void;
  onError: (msg: string) => void;
  setNnueBuffer(buf: Uint8Array, index?: number): void;
  getRecommendedNnue(index?: number): string;
}

class FullSfDriver implements EngineDriver {
  private instance: StockfishWebInstance | null = null;
  constructor(private onLine: (s: string) => void) {}

  async start(): Promise<void> {
    // Load both NNUEs in parallel with the engine module.
    const moduleUrl = new URL('/stockfish/sf171-79.js', window.location.origin).href;
    const [mod, bigNnue, smallNnue] = await Promise.all([
      import(/* @vite-ignore */ moduleUrl) as Promise<{ default: (opts?: object) => Promise<StockfishWebInstance> }>,
      getBigNnue(),
      getSmallNnue(),
    ]);

    this.instance = await mod.default({});
    this.instance.listen = (line: string) => this.onLine(line);
    this.instance.onError = (msg: string) => console.error('[sf171-79]', msg);

    // Networks are dual: index 0 = big, index 1 = small. Lila-style.
    this.instance.setNnueBuffer(bigNnue, 0);
    this.instance.setNnueBuffer(smallNnue, 1);

    // Initial UCI handshake.
    this.instance.uci('uci');
    this.instance.uci('isready');

    // Wait for readyok.
    await new Promise<void>((resolve) => {
      const prevListen = this.instance!.listen;
      this.instance!.listen = (line: string) => {
        prevListen(line);
        if (line === 'readyok') {
          this.instance!.listen = prevListen;
          resolve();
        }
      };
    });
  }

  send(cmd: string): void {
    this.instance?.uci(cmd);
  }

  destroy(): void {
    try {
      this.instance?.uci('quit');
    } catch {
      // ignore — module may already be torn down
    }
    this.instance = null;
  }
}

// ---------------------------------------------------------------------------
// Public service — wraps a driver and adds analyze-queue semantics.
// ---------------------------------------------------------------------------

export class StockfishService {
  private driver: EngineDriver | null = null;
  private listeners = new Set<(line: string) => void>();
  private readyPromise: Promise<void> | null = null;
  /** Tracks which build we picked, exposed for diagnostics/UI. */
  public buildKind: 'full-sf171' | 'lite-sf18' = 'lite-sf18';

  /**
   * True once we've sent a `go` and haven't yet seen the matching `bestmove`.
   * UCI requires that we wait for `bestmove` after `stop` before issuing the
   * next search, otherwise commands sent in between can be silently dropped.
   */
  private searching = false;

  /** Pending analyze request to run as soon as the current search ends. */
  private pending: AnalyzeRequest | null = null;

  start(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    const dispatchLine = (line: string) => {
      if (line.startsWith('bestmove')) {
        this.searching = false;
        if (this.pending) {
          const p = this.pending;
          this.pending = null;
          this.runAnalyze(p);
        }
      }
      for (const cb of this.listeners) cb(line);
    };

    if (canUseFullSf()) {
      this.buildKind = 'full-sf171';
      this.driver = new FullSfDriver(dispatchLine);
    } else {
      this.buildKind = 'lite-sf18';
      this.driver = new LiteDriver(dispatchLine);
    }

    this.readyPromise = this.driver.start().catch((err) => {
      // Full SF failed for some reason (e.g. NNUE fetch blocked). Fall back
      // to lite once, then surface any further failure to the caller.
      if (this.buildKind === 'full-sf171') {
        console.warn('[stockfish] full SF init failed, falling back to lite:', err);
        this.driver?.destroy();
        this.buildKind = 'lite-sf18';
        this.driver = new LiteDriver(dispatchLine);
        return this.driver.start();
      }
      throw err;
    });

    return this.readyPromise;
  }

  send(cmd: string): void {
    this.driver?.send(cmd);
  }

  onLine(cb: (line: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * Request analysis. Safe to call repeatedly: if a search is already in
   * flight we send `stop` and queue the new request to fire on `bestmove`.
   *
   * `limit` can be either depth-bounded or node-bounded; node-bounded is
   * preferred for Lichess parity (fishnet uses `go nodes 1500000`).
   */
  analyze(req: AnalyzeRequest): void;
  /** @deprecated legacy positional form — prefer the request-object overload */
  analyze(fen: string, multipv: number, depth?: number, hashMb?: number, analyseMode?: boolean): void;
  analyze(
    arg: string | AnalyzeRequest,
    multipv?: number,
    depth = 24,
    hashMb = 16,
    analyseMode = true,
  ): void {
    const req: AnalyzeRequest =
      typeof arg === 'string'
        ? {
            fen: arg,
            multipv: multipv ?? 1,
            limit: { kind: 'depth', value: depth },
            hashMb,
            threads: preferredThreads(),
            analyseMode,
          }
        : arg;

    if (this.searching) {
      this.pending = req;
      this.driver?.send('stop');
      return;
    }
    this.runAnalyze(req);
  }

  private runAnalyze(req: AnalyzeRequest): void {
    if (!this.driver) return;
    this.driver.send(`setoption name Threads value ${req.threads}`);
    this.driver.send(`setoption name Hash value ${req.hashMb}`);
    this.driver.send(`setoption name UCI_AnalyseMode value ${req.analyseMode}`);
    this.driver.send(`setoption name MultiPV value ${req.multipv}`);
    this.driver.send(`position fen ${req.fen}`);
    this.driver.send(
      req.limit.kind === 'nodes' ? `go nodes ${req.limit.value}` : `go depth ${req.limit.value}`,
    );
    this.searching = true;
  }

  stop(): void {
    this.pending = null;
    if (this.searching) this.driver?.send('stop');
  }

  destroy(): void {
    this.pending = null;
    try {
      this.driver?.send('stop');
    } catch {
      // ignore
    }
    this.driver?.destroy();
    this.driver = null;
    this.listeners.clear();
    this.readyPromise = null;
    this.searching = false;
  }
}

export { preferredThreads };
