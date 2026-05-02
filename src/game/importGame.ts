/**
 * Fetch the most recent game PGN for a user from Lichess or Chess.com.
 */

export type ImportResult = { pgn: string; orientation: 'white' | 'black' };
export type ImportRecentResult = ImportResult & {
  white: string;
  black: string;
  result: string;
  date: string;
};

const LICHESS_TOKEN = import.meta.env.VITE_LICHESS_TOKEN ?? '';

function pgnHeaderValue(pgn: string, tag: string): string {
  const m = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]+)"\\]`));
  return m ? m[1] : '';
}

function toImportRecentResult(pgn: string, username: string): ImportRecentResult {
  const trimmed = pgn.trim();
  const white = pgnHeaderValue(trimmed, 'White');
  const black = pgnHeaderValue(trimmed, 'Black');
  const result = pgnHeaderValue(trimmed, 'Result') || '*';
  const date = pgnHeaderValue(trimmed, 'Date') || '????.??.??';
  const orientation = black.toLowerCase() === username.toLowerCase() ? 'black' : 'white';
  return { pgn: trimmed, orientation, white, black, result, date };
}

function splitPgnGames(pgnBundle: string): string[] {
  return pgnBundle
    .trim()
    .split(/\r?\n\r?\n(?=\[Event\s+")/)
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
}

export async function fetchRecentLichessGames(
  username: string,
  max = 5,
): Promise<ImportRecentResult[]> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&pgnInJson=false&clocks=true&evals=false`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/x-chess-pgn',
      ...(LICHESS_TOKEN ? { Authorization: `Bearer ${LICHESS_TOKEN}` } : {}),
    },
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Lichess user "${username}" not found.`);
    throw new Error(`Lichess API error: ${res.status} ${res.statusText}`);
  }
  const body = await res.text();
  const games = splitPgnGames(body).slice(0, max);
  if (!games.length) throw new Error(`No games found for Lichess user "${username}".`);
  return games.map((pgn) => toImportRecentResult(pgn, username));
}

export async function fetchRecentChesscomGames(
  username: string,
  max = 5,
): Promise<ImportRecentResult[]> {
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
  );
  if (!archivesRes.ok) {
    if (archivesRes.status === 404) throw new Error(`Chess.com user "${username}" not found.`);
    throw new Error(`Chess.com API error: ${archivesRes.status} ${archivesRes.statusText}`);
  }

  const { archives } = (await archivesRes.json()) as { archives?: string[] };
  if (!archives?.length) throw new Error(`No games found for Chess.com user "${username}".`);

  const collected: ImportRecentResult[] = [];
  for (let i = archives.length - 1; i >= 0 && collected.length < max; i--) {
    const gamesRes = await fetch(archives[i]);
    if (!gamesRes.ok) continue;
    const { games } = (await gamesRes.json()) as {
      games?: { pgn?: string; white?: { username?: string }; black?: { username?: string } }[];
    };
    if (!games?.length) continue;

    for (let j = games.length - 1; j >= 0 && collected.length < max; j--) {
      const pgn = games[j].pgn?.trim();
      if (!pgn) continue;
      collected.push(toImportRecentResult(pgn, username));
    }
  }

  if (!collected.length) throw new Error(`No games found for Chess.com user "${username}".`);
  return collected;
}

/**
 * Returns the PGN and board orientation for the user's most recent Lichess game.
 */
export async function fetchLastLichessGame(username: string): Promise<ImportResult> {
  const [game] = await fetchRecentLichessGames(username, 1);
  return { pgn: game.pgn, orientation: game.orientation };
}

/**
 * Returns the PGN and board orientation for the user's most recent Chess.com game.
 * Chess.com has a public API — no auth required.
 */
export async function fetchLastChesscomGame(username: string): Promise<ImportResult> {
  const [game] = await fetchRecentChesscomGames(username, 1);
  return { pgn: game.pgn, orientation: game.orientation };
}
