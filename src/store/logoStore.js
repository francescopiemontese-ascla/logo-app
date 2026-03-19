import { create } from 'zustand';
import { getAllLogos, searchLogos, insertLogo, deleteLogo, updateLogo, getAllCollections, insertCollection, deleteCollection } from '../utils/database';

export const useLogoStore = create((set, get) => ({
  logos: [],
  collections: [],
  selectedIds: new Set(),
  searchQuery: '',
  filterFormat: null,
  filterCollection: null,
  viewMode: 'grid', // 'grid' | 'list'
  isLoading: false,

  // --- Actions ---
  loadLogos: async () => {
    set({ isLoading: true });
    try {
      const logos = await getAllLogos();
      set({ logos, isLoading: false });
    } catch (err) {
      console.error('Failed to load logos:', err);
      set({ isLoading: false });
    }
  },

  loadCollections: async () => {
    try {
      const collections = await getAllCollections();
      set({ collections });
    } catch (err) {
      console.error('Failed to load collections:', err);
    }
  },

  addLogo: async (logoData) => {
    const id = await insertLogo(logoData);
    await get().loadLogos();
    return id;
  },

  removeLogo: async (id) => {
    await deleteLogo(id);
    const selectedIds = new Set(get().selectedIds);
    selectedIds.delete(id);
    set({ selectedIds });
    await get().loadLogos();
  },

  updateLogo: async (id, updates) => {
    await updateLogo(id, updates);
    await get().loadLogos();
  },

  addCollection: async (data) => {
    const id = await insertCollection(data);
    await get().loadCollections();
    return id;
  },

  removeCollection: async (id) => {
    await deleteCollection(id);
    await get().loadCollections();
    await get().loadLogos();
  },

  search: async (query) => {
    set({ searchQuery: query, isLoading: true });
    try {
      const logos = query.trim() ? await searchLogos(query) : await getAllLogos();
      set({ logos, isLoading: false });
    } catch (err) {
      console.error('Search failed:', err);
      set({ isLoading: false });
    }
  },

  setFilterFormat: (format) => set({ filterFormat: format }),
  setFilterCollection: (collectionId) => set({ filterCollection: collectionId }),
  setViewMode: (mode) => set({ viewMode: mode }),

  toggleSelect: (id) => {
    const selectedIds = new Set(get().selectedIds);
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    set({ selectedIds });
  },

  selectAll: () => {
    const filtered = get().getFilteredLogos();
    set({ selectedIds: new Set(filtered.map(l => l.id)) });
  },

  clearSelection: () => set({ selectedIds: new Set() }),

  getFilteredLogos: () => {
    const { logos, filterFormat, filterCollection } = get();
    return logos.filter((logo) => {
      if (filterFormat && logo.original_format !== filterFormat) return false;
      if (filterCollection && logo.collection_id !== filterCollection) return false;
      return true;
    });
  },

  getSelectedLogos: () => {
    const { logos, selectedIds } = get();
    return logos.filter(l => selectedIds.has(l.id));
  },
}));
