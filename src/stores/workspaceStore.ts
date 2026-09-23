import { create } from 'zustand';
import {
  Workspace,
  listWorkspaces,
  createWorkspace as apiCreateWorkspace,
  updateWorkspace as apiUpdateWorkspace,
  archiveWorkspace as apiArchiveWorkspace,
  setActiveWorkspace as apiSetActiveWorkspace,
  getActiveWorkspace as apiGetActiveWorkspace,
} from '../lib/ipc';

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;

  loadWorkspaces: (includeArchived?: boolean) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  createWorkspace: (name: string, icon?: string, description?: string) => Promise<Workspace>;
  updateWorkspace: (id: string, name: string, icon?: string, description?: string) => Promise<void>;
  archiveWorkspace: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspace: null,
  isLoading: false,
  error: null,

  loadWorkspaces: async (includeArchived = false) => {
    set({ isLoading: true, error: null });
    try {
      const workspaces = await listWorkspaces(includeArchived);
      let active = workspaces.find((w) => w.is_active);
      if (!active) {
        try {
          active = await apiGetActiveWorkspace();
        } catch {
          active = workspaces[0] || null;
        }
      }
      set({ workspaces, activeWorkspace: active || null, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message || String(err), isLoading: false });
    }
  },

  switchWorkspace: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiSetActiveWorkspace(id);
      const workspaces = await listWorkspaces(false);
      const active = workspaces.find((w) => w.id === id) || null;
      set({ workspaces, activeWorkspace: active, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message || String(err), isLoading: false });
    }
  },

  createWorkspace: async (name: string, icon?: string, description?: string) => {
    set({ isLoading: true, error: null });
    try {
      const created = await apiCreateWorkspace(name, icon, description);
      // Auto-switch to the newly created workspace
      await apiSetActiveWorkspace(created.id);
      const workspaces = await listWorkspaces(false);
      const active = workspaces.find((w) => w.id === created.id) || created;
      set({ workspaces, activeWorkspace: active, isLoading: false });
      return created;
    } catch (err) {
      set({ error: (err as Error).message || String(err), isLoading: false });
      throw err;
    }
  },

  updateWorkspace: async (id: string, name: string, icon?: string, description?: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiUpdateWorkspace(id, name, icon, description);
      await get().loadWorkspaces();
    } catch (err) {
      set({ error: (err as Error).message || String(err), isLoading: false });
    }
  },

  archiveWorkspace: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiArchiveWorkspace(id, true);
      await get().loadWorkspaces();
    } catch (err) {
      set({ error: (err as Error).message || String(err), isLoading: false });
    }
  },
}));
