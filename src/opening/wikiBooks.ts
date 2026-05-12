import type { MoveNode } from '../game/tree';

export const wikiBooksUrl = 'https://en.wikibooks.org';

// Mirrors the Lichess analysis query params for opening theory extracts.
const apiArgs =
  'redirects&origin=*&action=query&prop=extracts&formatversion=2&format=json&stable=1';

const cache = new Map<string, Promise<OpeningWikiResult>>();

export interface OpeningWikiResult {
  title: string;
  pathKey: string;
  html: string;
  sourceUrl: string;
  status: 'ok' | 'missing' | 'skipped';
}

function plyPrefix(ply: number): string {
  return `${Math.floor((ply + 1) / 2)}${ply % 2 === 1 ? '._' : '...'}`;
}

export function buildWikiPathFromNodes(nodes: MoveNode[]): string {
  const pathParts = nodes.map((node) => `${plyPrefix(node.ply)}${node.san}`);
  return pathParts.join('/').replace(/[+!#?]/g, '');
}

function removeH1(html: string): string {
  return html.replace(/<h1.+<\/h1>/g, '');
}

function removeEmptyParagraph(html: string): string {
  return html.replace(/<p>(<br \/>|\s)*<\/p>/g, '');
}

function removeTheoryTableSection(html: string): string {
  return html.replace(/<h2 data-mw-anchor="Theory_table">Theory table<\/h2>.*?(?=<h[1-6]|$)/gs, '');
}

function removeAllBlacksMovesSection(html: string): string {
  return html.replace(
    /<h2 data-mw-anchor="All_possible_Black's_moves" data-mw-fallback-anchor="All_possible_Black\\.27s_moves">All possible Black's moves<\/h2>.*?(?=<h[1-6]|$)/gs,
    '',
  );
}

function removeAllPossibleRepliesSection(html: string): string {
  return html.replace(/<h3 data-mw-anchor="All_possible_replies">All possible replies<\/h3>.*?(?=<h[1-6]|$)/gs, '');
}

function removeExternalLinksSection(html: string): string {
  return html.replace(/<h2 data-mw-anchor="External_links">External links<\/h2>.*?(?=<h[1-6]|$)/gs, '');
}

function removeContributing(html: string): string {
  return html.replace('When contributing to this Wikibook, please follow the Conventions for organization.', '');
}

function removeUnsafeTags(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
}

function readMore(title: string): string {
  return `<p><a target="_blank" rel="noopener noreferrer" href="${wikiBooksUrl}/wiki/${title}">Read more on WikiBooks</a></p>`;
}

function transformWikiHtml(html: string, title: string): string {
  return (
    removeH1(
      removeEmptyParagraph(
        removeTheoryTableSection(
          removeAllBlacksMovesSection(
            removeAllPossibleRepliesSection(removeExternalLinksSection(removeContributing(removeUnsafeTags(html)))),
          ),
        ),
      ),
    ) + readMore(title)
  );
}

function skippedResult(pathKey: string): OpeningWikiResult {
  return {
    title: '',
    pathKey,
    html: '',
    sourceUrl: '',
    status: 'skipped',
  };
}

async function fetchWikiForPath(pathKey: string): Promise<OpeningWikiResult> {
  const title = `Chess_Opening_Theory/${pathKey}`;
  const sourceUrl = `${wikiBooksUrl}/wiki/${title}`;
  const res = await fetch(`${wikiBooksUrl}/w/api.php?titles=${encodeURIComponent(title)}&${apiArgs}`);

  if (!res.ok) {
    return {
      title,
      pathKey,
      html: '',
      sourceUrl,
      status: 'missing',
    };
  }

  const json = await res.json();
  const page = json?.query?.pages?.[0];

  if (!page || page.missing || !page.extract || page.extract.length === 0) {
    return {
      title,
      pathKey,
      html: '',
      sourceUrl,
      status: 'missing',
    };
  }

  return {
    title,
    pathKey,
    html: transformWikiHtml(String(page.extract), title),
    sourceUrl,
    status: 'ok',
  };
}

export function fetchOpeningWiki(nodes: MoveNode[]): Promise<OpeningWikiResult> {
  const pathKey = buildWikiPathFromNodes(nodes);

  // Same practical limits used in Lichess.
  if (nodes.length > 30 || !pathKey || pathKey.length > 234) {
    return Promise.resolve(skippedResult(pathKey));
  }

  let promise = cache.get(pathKey);
  if (!promise) {
    promise = fetchWikiForPath(pathKey).catch((err) => {
      cache.delete(pathKey);
      throw err;
    });
    cache.set(pathKey, promise);
  }
  return promise;
}

export function clearOpeningWikiCache(): void {
  cache.clear();
}
