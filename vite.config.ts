import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cross-origin isolation headers — required for SharedArrayBuffer (which
// multi-threaded Stockfish needs). We use COEP=credentialless instead of
// require-corp so that Lichess endpoints without CORP headers (explorer,
// cloud-eval) continue to work. Browser support: Chrome/Edge 96+, Firefox
// 119+, Safari 17.4+. On older browsers the engine code detects the lack
// of SharedArrayBuffer and falls back to the single-threaded build.
//
// In production these headers MUST be sent by the host (Cloudflare Pages,
// Netlify, Vercel, nginx, etc.). For Netlify see `_headers`; for Cloudflare
// Pages see `public/_headers`. The dev/preview servers below cover local.
const CROSS_ORIGIN_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: CROSS_ORIGIN_HEADERS,
  },
  preview: {
    headers: CROSS_ORIGIN_HEADERS,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Pre-bundle these so the dev server doesn't choke on their ESM exports.
    include: ['chessops', '@lichess-org/chessground'],
    // lila-stockfish-web ships pre-built wasm/js — we load it from /stockfish/
    // (public folder), so exclude it from dep optimisation.
    exclude: ['lila-stockfish-web'],
  },
});
