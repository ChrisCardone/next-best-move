import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  lichessUsername: string;
  chesscomUsername: string;
  setLichessUsername: (name: string) => void;
  setChesscomUsername: (name: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      lichessUsername: '',
      chesscomUsername: '',
      setLichessUsername: (name) => set({ lichessUsername: name.trim() }),
      setChesscomUsername: (name) => set({ chesscomUsername: name.trim() }),
    }),
    { name: 'nbm-app-settings' },
  ),
);
