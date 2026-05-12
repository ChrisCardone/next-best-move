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

/**
 * Whether a wiki result has anything user-visible to display. False for
 * `missing`/`skipped` (no article / path too long) — used by the workspace
 * tab strip to hide the Opening Wiki tab entirely on irrelevant positions.
 */
export function hasOpeningWikiContent(state: OpeningWikiState): boolean {
  if (state.loading || state.error) return true;
  return state.data?.status === 'ok';
}

// ── Per-key cache shared across hook instances ────────────────────────────
// Two consumers (the workspace tab strip checking visibility + the panel
// itself rendering content) call this hook with identical inputs. Without
// sharing, they'd each fire their own debounced fetch. The cache below lets
// both subscribe to a single in-flight request and the resulting state.

interface CacheEntry {
  state: OpeningWikiState;
  subscribers: Set<(s: OpeningWikiState) => void>;
  inflight?: { cancelled: boolean; timer: number };
}

const cache = new Map<string, CacheEntry>();

function getEntry(key: string): CacheEntry {
  let entry = cache.get(key);
  if (!entry) {
    entry = { state: { data: null, loading: false, error: null }, subscribers: new Set() };
    cache.set(key, entry);
  }
  return entry;
}

function publish(entry: CacheEntry, next: OpeningWikiState): void {
  entry.state = next;
  for (const cb of entry.subscribers) cb(next);
}

export function useOpeningWiki(nodes: MoveNode[], opts: OpeningWikiOpts = {}): OpeningWikiState {
  const enabled = opts.enabled ?? true;
  const key = useMemo(() => nodes.map((n) => `${n.ply}:${n.san}`).join('|'), [nodes]);
  const cacheKey = enabled && nodes.length > 0 ? key : '';

  const [state, setState] = useState<OpeningWikiState>(() =>
    cacheKey ? getEntry(cacheKey).state : { data: null, loading: false, error: null },
  );

  useEffect(() => {
    if (!cacheKey) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    const entry = getEntry(cacheKey);
    entry.subscribers.add(setState);
    setState(entry.state);

    // Kick off a fetch if we haven't already (and don't have data yet).
    if (!entry.inflight && entry.state.data === null && !entry.state.loading) {
      publish(entry, { ...entry.state, loading: true, error: null });
      const inflight = { cancelled: false, timer: 0 };
      entry.inflight = inflight;
      inflight.timer = window.setTimeout(() => {
        fetchOpeningWiki(nodes)
          .then((data) => {
            if (inflight.cancelled) return;
            entry.inflight = undefined;
            publish(entry, { data, loading: false, error: null });
          })
          .catch((err: unknown) => {
            if (inflight.cancelled) return;
            entry.inflight = undefined;
            const message = err instanceof Error ? err.message : 'Failed to load WikiBooks data';
            publish(entry, { data: null, loading: false, error: message });
          });
      }, 500);
    }

    return () => {
      entry.subscribers.delete(setState);
      // If no one else is listening and we haven't resolved yet, cancel the
      // pending debounce so we don't fetch for a position the user already
      // navigated away from.
      if (entry.subscribers.size === 0 && entry.inflight) {
        entry.inflight.cancelled = true;
        window.clearTimeout(entry.inflight.timer);
        entry.inflight = undefined;
        // Reset to idle so a later mount can re-trigger.
        entry.state = { data: null, loading: false, error: null };
      }
    };
  }, [cacheKey, nodes]);

  return state;
}
