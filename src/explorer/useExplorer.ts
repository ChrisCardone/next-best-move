import { useEffect, useState } from 'react';
import {
  fetchMasters,
  fetchLichess,
  type ExplorerResponse,
  type Speed,
  type RatingBucket,
} from './lichessExplorer';

export type ExplorerSource = 'masters' | 'lichess';

interface ExplorerOpts {
  speeds?: Speed[];
  ratings?: RatingBucket[];
}

interface State {
  data: ExplorerResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches explorer data for a FEN. Debounced so quick navigation doesn't
 * spam the API.
 */
export function useExplorer(fen: string, source: ExplorerSource, opts: ExplorerOpts = {}): State {
  const [state, setState] = useState<State>({
    data: null,
    loading: false,
    error: null,
  });

  const speedsKey = opts.speeds?.join(',') ?? '';
  const ratingsKey = opts.ratings?.join(',') ?? '';

  useEffect(() => {
    let cancelled = false;

    setState((s) => ({ ...s, loading: true, error: null }));

    const handle = window.setTimeout(() => {
      const promise =
        source === 'masters'
          ? fetchMasters(fen)
          : fetchLichess(fen, { speeds: opts.speeds, ratings: opts.ratings });

      promise
        .then((data) => {
          if (cancelled) return;
          setState({ data, loading: false, error: null });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : 'Request failed';
          setState({ data: null, loading: false, error: msg });
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, source, speedsKey, ratingsKey]);

  return state;
}
