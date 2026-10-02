import { create } from 'zustand';
import {
  addMemory,
  deleteMemory,
  listMemories,
  MemoryCategory,
  MemoryRecord,
  searchMemories,
  rerankMemories,
  updateMemory,
} from '../lib/ipc';
import { useWorkspaceStore } from './workspaceStore';

export interface MemoryState {
  memories: MemoryRecord[];
  isLoading: boolean;
  error: string | null;
  activeCategory: MemoryCategory | 'all';
  searchQuery: string;
  crossWorkspaceSearch: boolean;

  loadMemories: () => Promise<void>;
  createMemory: (content: string, category: MemoryCategory, workspaceId?: string) => Promise<void>;
  editMemory: (id: string, content: string, category: MemoryCategory, workspaceId?: string) => Promise<void>;
  removeMemory: (id: string) => Promise<void>;
  clearError: () => void;
  setActiveCategory: (cat: MemoryCategory | 'all') => void;
  setSearchQuery: (query: string) => void;
  setCrossWorkspaceSearch: (enabled: boolean) => void;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  memories: [],
  isLoading: false,
  error: null,
  activeCategory: 'all',
  searchQuery: '',
  crossWorkspaceSearch: false,

  loadMemories: async () => {
    set({ isLoading: true, error: null });
    try {
      const { activeCategory, searchQuery, crossWorkspaceSearch } = get();
      const activeWs = useWorkspaceStore.getState().activeWorkspace;
      const wsId = crossWorkspaceSearch ? undefined : activeWs?.id;

      if (searchQuery.trim()) {
        try {
          const reranked = await rerankMemories(searchQuery.trim(), wsId, crossWorkspaceSearch, 20);
          let mems: MemoryRecord[] = reranked.map((r) => ({
            id: r.memory_id,
            content: r.content,
            category: r.category as MemoryCategory,
            created_at: 0,
            updated_at: 0,
          }));
          if (activeCategory !== 'all') {
            mems = mems.filter((m) => m.category === activeCategory);
          }
          set({ memories: mems });
        } catch {
          const results = await searchMemories(searchQuery.trim(), wsId, crossWorkspaceSearch, 20);
          let mems = results.map((r) => r.memory);
          if (activeCategory !== 'all') {
            mems = mems.filter((m) => m.category === activeCategory);
          }
          set({ memories: mems });
        }
      } else {
        const catFilter = activeCategory === 'all' ? undefined : activeCategory;
        const mems = await listMemories(catFilter, wsId);
        set({ memories: mems });
      }
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  createMemory: async (content: string, category: MemoryCategory, workspaceId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const activeWs = useWorkspaceStore.getState().activeWorkspace;
      const wsId = workspaceId || activeWs?.id || 'default';
      await addMemory(content.trim(), category, wsId);
      await get().loadMemories();
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  editMemory: async (id: string, content: string, category: MemoryCategory, workspaceId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const activeWs = useWorkspaceStore.getState().activeWorkspace;
      const wsId = workspaceId || activeWs?.id;
      await updateMemory(id, content.trim(), category, wsId);
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

  clearError: () => set({ error: null }),

  setActiveCategory: (activeCategory) => {
    set({ activeCategory });
    get().loadMemories();
  },

  setSearchQuery: (searchQuery) => {
    set({ searchQuery });
    get().loadMemories();
  },

  setCrossWorkspaceSearch: (crossWorkspaceSearch) => {
    set({ crossWorkspaceSearch });
    get().loadMemories();
  },
}));

