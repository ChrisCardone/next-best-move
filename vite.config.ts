import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // We ship the single-threaded Stockfish 18 lite build, which does NOT
  // require SharedArrayBuffer / cross-origin isolation. Setting COOP/COEP
  // would break cross-origin fetches to APIs without CORP headers
  // (e.g. explorer.lichess.ovh), so we deliberately leave them off.
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Pre-bundle these so the dev server doesn't choke on their ESM exports.
    include: ['chessops', '@lichess-org/chessground'],
  },
});
