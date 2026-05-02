/**
 * Thin wrapper around the Stockfish Web Worker. Communicates via UCI strings.
 * Created lazily — only when the user enables the engine.
 */
export class StockfishService {
  private worker: Worker | null = null;
  private listeners = new Set<(line: string) => void>();
  private readyPromise: Promise<void> | null = null;

  /**
   * True once we've sent a `go` and haven't yet seen the matching `bestmove`.
   * UCI requires that we wait for `bestmove` after `stop` before issuing the
   * next search, otherwise commands sent in between can be silently dropped.
   */
  private searching = false;

  /** Pending analyze request to run as soon as the current search ends. */
  private pending: { fen: string; multipv: number; depth: number; hashMb: number; analyseMode: boolean } | null = null;

  start(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker('/stockfish/stockfish-18-lite-single.js');
      } catch (err) {
        reject(err);
        return;
      }

      this.worker.onerror = (e) => {
        reject(new Error(`Stockfish worker error: ${e.message ?? 'unknown'}`));
      };

      this.worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : (e.data?.text ?? '');
        if (!line) return;

        if (line === 'readyok' && this.readyPromise) {
          resolve();
        }
        if (line.startsWith('bestmove')) {
          this.searching = false;
          // If a request piled up while we were stopping, run it now.
          if (this.pending) {
            const p = this.pending;
            this.pending = null;
            this.runAnalyze(p.fen, p.multipv, p.depth, p.hashMb, p.analyseMode);
          }
        }

        for (const cb of this.listeners) cb(line);
      };

      this.send('uci');
      this.send('isready');
    });

    return this.readyPromise;
  }

  send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  onLine(cb: (line: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * Request analysis. Safe to call repeatedly: if a search is already in
   * flight we send `stop` and queue the new request to fire on `bestmove`.
   */
  analyze(fen: string, multipv: number, depth = 24, hashMb = 16, analyseMode = true): void {
    if (this.searching) {
      this.pending = { fen, multipv, depth, hashMb, analyseMode };
      this.send('stop');
      return;
    }
    this.runAnalyze(fen, multipv, depth, hashMb, analyseMode);
  }

  private runAnalyze(fen: string, multipv: number, depth: number, hashMb: number, analyseMode: boolean): void {
    this.send(`setoption name Hash value ${hashMb}`);
    this.send(`setoption name UCI_AnalyseMode value ${analyseMode}`);
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
    this.searching = true;
  }

  stop(): void {
    this.pending = null;
    if (this.searching) this.send('stop');
  }

  destroy(): void {
    this.pending = null;
    this.send('stop');
    this.send('quit');
    this.worker?.terminate();
    this.worker = null;
    this.listeners.clear();
    this.readyPromise = null;
    this.searching = false;
  }
}
