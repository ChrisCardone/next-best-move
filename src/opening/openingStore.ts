import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OpeningState {
  showWiki: boolean;
  toggleShowWiki: () => void;
}

export const useOpeningStore = create<OpeningState>()(
  persist(
    (set) => ({
      showWiki: true,
      toggleShowWiki: () => set((s) => ({ showWiki: !s.showWiki })),
    }),
    {
      name: 'nbm-opening-settings',
      partialize: (state) => ({ showWiki: state.showWiki }),
    },
  ),
);
