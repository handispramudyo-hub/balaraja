import { create } from 'zustand'

const useAppStore = create((set) => ({
  sidebarOpen: true,
  searchQuery: '',

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}))

export default useAppStore
