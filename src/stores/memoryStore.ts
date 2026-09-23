import { create } from 'zustand';
import {
  addMemory,
  deleteMemory,
  listMemories,
  MemoryCategory,
  MemoryRecord,
  searchMemories,
  updateMemory,
} from '../lib/ipc';

export interface MemoryState {
  memories: MemoryRecord[];
  isLoading: boolean;
  error: string | null;
  activeCategory: MemoryCategory | 'all';
  searchQuery: string;

  loadMemories: () => Promise<void>;
  createMemory: (content: string, category: MemoryCategory) => Promise<void>;
  editMemory: (id: string, content: string, category: MemoryCategory) => Promise<void>;
  removeMemory: (id: string) => Promise<void>;
  setActiveCategory: (cat: MemoryCategory | 'all') => void;
  setSearchQuery: (query: string) => void;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  memories: [],
  isLoading: false,
  error: null,
  activeCategory: 'all',
  searchQuery: '',

  loadMemories: async () => {
    set({ isLoading: true, error: null });
    try {
      const { activeCategory, searchQuery } = get();
      if (searchQuery.trim()) {
        const results = await searchMemories(searchQuery.trim(), 20);
        let mems = results.map((r) => r.memory);
        if (activeCategory !== 'all') {
          mems = mems.filter((m) => m.category === activeCategory);
        }
        set({ memories: mems });
      } else {
        const catFilter = activeCategory === 'all' ? undefined : activeCategory;
        const mems = await listMemories(catFilter);
        set({ memories: mems });
      }
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  createMemory: async (content: string, category: MemoryCategory) => {
    set({ isLoading: true, error: null });
    try {
      await addMemory(content.trim(), category);
      await get().loadMemories();
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  editMemory: async (id: string, content: string, category: MemoryCategory) => {
    set({ isLoading: true, error: null });
    try {
      await updateMemory(id, content.trim(), category);
      await get().loadMemories();
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  removeMemory: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await deleteMemory(id);
      await get().loadMemories();
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  setActiveCategory: (activeCategory) => {
    set({ activeCategory });
    get().loadMemories();
  },

  setSearchQuery: (searchQuery) => {
    set({ searchQuery });
    get().loadMemories();
  },
}));
