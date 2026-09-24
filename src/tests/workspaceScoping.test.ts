import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ipc from '../lib/ipc';
import { useMemoryStore } from '../stores/memoryStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

vi.mock('../lib/ipc', () => ({
  listMemories: vi.fn(),
  addMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
  searchMemories: vi.fn(),
  listWorkspaces: vi.fn(),
  setActiveWorkspace: vi.fn(),
  getActiveWorkspace: vi.fn(),
}));

describe('Workspace Scoping & Isolation Tests', () => {
  const workspaceAlpha: ipc.Workspace = {
    id: 'ws-alpha',
    name: 'Project Alpha',
    icon: null,
    description: 'Internal confidential project',
    is_active: true,
    is_archived: false,
    created_at: 1000,
    updated_at: 1000,
  };

  const workspaceBeta: ipc.Workspace = {
    id: 'ws-beta',
    name: 'Personal Hobby',
    icon: null,
    description: 'Weekend photography and books',
    is_active: false,
    is_archived: false,
    created_at: 2000,
    updated_at: 2000,
  };

  const memoryInAlpha: ipc.MemoryRecord = {
    id: 'mem-alpha-secret',
    content: 'Alpha API Secret Token: xyz987654321',
    category: 'project',
    workspace_id: 'ws-alpha',
    created_at: 1500,
    updated_at: 1500,
  };

  const memoryInBeta: ipc.MemoryRecord = {
    id: 'mem-beta-facts',
    content: 'Sony A7IV camera settings for portrait',
    category: 'preference',
    workspace_id: 'ws-beta',
    created_at: 2500,
    updated_at: 2500,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useMemoryStore.setState({
      memories: [],
      isLoading: false,
      error: null,
      activeCategory: 'all',
      searchQuery: '',
      crossWorkspaceSearch: false,
    });
    useWorkspaceStore.setState({
      workspaces: [workspaceAlpha, workspaceBeta],
      activeWorkspace: workspaceAlpha,
    });
  });

  it('strictly scopes listMemories to the active workspace', async () => {
    vi.mocked(ipc.listMemories).mockResolvedValueOnce([memoryInAlpha]);

    await useMemoryStore.getState().loadMemories();

    // Must query with ws-alpha scope
    expect(ipc.listMemories).toHaveBeenCalledWith(undefined, 'ws-alpha');
    const returned = useMemoryStore.getState().memories;
    expect(returned).toHaveLength(1);
    expect(returned[0].id).toBe('mem-alpha-secret');
    expect(returned[0].workspace_id).toBe('ws-alpha');
  });

  it('prevents memory leak when querying in another workspace', async () => {
    // Switch to Workspace Beta
    useWorkspaceStore.setState({ activeWorkspace: workspaceBeta });

    // Mock search in Workspace Beta returning only Beta memory
    vi.mocked(ipc.searchMemories).mockImplementation(async (_query, wsId) => {
      if (wsId === 'ws-beta') {
        return [{ memory: memoryInBeta, score: 5.0 }];
      }
      return [{ memory: memoryInAlpha, score: 10.0 }];
    });

    useMemoryStore.getState().setSearchQuery('secret token');
    await useMemoryStore.getState().loadMemories();

    expect(ipc.searchMemories).toHaveBeenCalledWith('secret token', 'ws-beta', false, 20);
    const results = useMemoryStore.getState().memories;
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('mem-beta-facts');
    // Workspace A memory MUST NOT be present
    expect(results.some((m) => m.id === 'mem-alpha-secret')).toBe(false);
  });

  it('enables cross-workspace search mode to query across all workspaces simultaneously', async () => {
    const crossResults: ipc.MemorySearchResult[] = [
      { memory: memoryInAlpha, score: 9.8 },
      { memory: memoryInBeta, score: 8.2 },
    ];
    vi.mocked(ipc.searchMemories).mockResolvedValue(crossResults);

    useMemoryStore.setState({
      crossWorkspaceSearch: true,
      searchQuery: 'project photography',
    });
    await useMemoryStore.getState().loadMemories();

    // When crossWorkspaceSearch is true, workspaceId passed to searchMemories is undefined and crossWorkspace flag is true
    expect(ipc.searchMemories).toHaveBeenCalledWith('project photography', undefined, true, 20);
    const results = useMemoryStore.getState().memories;
    expect(results).toHaveLength(2);
    expect(results.map((m) => m.id)).toContain('mem-alpha-secret');
    expect(results.map((m) => m.id)).toContain('mem-beta-facts');
  });

  it('associates new memory with current workspace by default', async () => {
    useWorkspaceStore.setState({ activeWorkspace: workspaceBeta });
    vi.mocked(ipc.addMemory).mockResolvedValueOnce({
      id: 'mem-beta-new',
      content: 'Focal length preference 50mm',
      category: 'preference',
      workspace_id: 'ws-beta',
      created_at: 3000,
      updated_at: 3000,
    });
    vi.mocked(ipc.listMemories).mockResolvedValueOnce([]);

    await useMemoryStore.getState().createMemory('Focal length preference 50mm', 'preference');

    expect(ipc.addMemory).toHaveBeenCalledWith('Focal length preference 50mm', 'preference', 'ws-beta');
  });
});
