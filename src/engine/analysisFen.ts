export function fenForAnalysis(fen: string, threatMode: boolean): string {
  if (!threatMode) return fen;

  const parts = fen.split(' ');
  if (parts.length < 2) return fen;

  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  if (parts.length >= 4) parts[3] = '-';

  return parts.join(' ');
}