import { create } from 'zustand';

export const useAppStore = create((set) => ({
  activeTab: 'library', // 'library' | 'editor' | 'projects'
  theme: 'dark',
  dbReady: false,
  notification: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    return { theme: newTheme };
  }),

  setDbReady: (ready) => set({ dbReady: ready }),

  showNotification: (message, type = 'info', duration = 3000) => {
    set({ notification: { message, type, id: Date.now() } });
    setTimeout(() => set({ notification: null }), duration);
  },
}));
