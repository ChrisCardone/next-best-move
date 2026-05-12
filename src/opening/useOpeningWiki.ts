import { useEffect, useMemo, useState } from 'react';
import type { MoveNode } from '../game/tree';
import { fetchOpeningWiki, type OpeningWikiResult } from './wikiBooks';

interface OpeningWikiState {
  data: OpeningWikiResult | null;
  loading: boolean;
  error: string | null;
}

interface OpeningWikiOpts {
  enabled?: boolean;
}

export function useOpeningWiki(nodes: MoveNode[], opts: OpeningWikiOpts = {}): OpeningWikiState {
  const [state, setState] = useState<OpeningWikiState>({
    data: null,
    loading: false,
    error: null,
  });

  const enabled = opts.enabled ?? true;
  const key = useMemo(() => nodes.map((n) => `${n.ply}:${n.san}`).join('|'), [nodes]);

  useEffect(() => {
    let cancelled = false;

    if (!enabled || nodes.length === 0) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    const handle = window.setTimeout(() => {
      fetchOpeningWiki(nodes)
        .then((data) => {
          if (cancelled) return;
          setState({ data, loading: false, error: null });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : 'Failed to load WikiBooks data';
          setState({ data: null, loading: false, error: message });
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [enabled, key, nodes]);

  return state;
}
