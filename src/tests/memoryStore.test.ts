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
}));

describe('useMemoryStore Unit Tests', () => {
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
      activeWorkspace: {
        id: 'ws-123',
        name: 'Primary Workspace',
        icon: null,
        description: null,
        is_active: true,
        is_archived: false,
        created_at: 1000,
        updated_at: 1000,
      },
    });
  });

  it('loads memories without category filter when activeCategory is "all"', async () => {
    const mockMemories: ipc.MemoryRecord[] = [
      {
        id: 'mem-1',
        content: 'Prefers dark mode UI',
        category: 'preference',
        workspace_id: 'ws-123',
        created_at: 1000,
        updated_at: 1000,
      },
    ];
    vi.mocked(ipc.listMemories).mockResolvedValueOnce(mockMemories);

    await useMemoryStore.getState().loadMemories();

    expect(ipc.listMemories).toHaveBeenCalledWith(undefined, 'ws-123');
    expect(useMemoryStore.getState().memories).toEqual(mockMemories);
    expect(useMemoryStore.getState().isLoading).toBe(false);
  });

  it('filters by category when activeCategory is set', async () => {
    vi.mocked(ipc.listMemories).mockResolvedValueOnce([]);

    useMemoryStore.getState().setActiveCategory('project');

    expect(ipc.listMemories).toHaveBeenCalledWith('project', 'ws-123');
    expect(useMemoryStore.getState().activeCategory).toBe('project');
  });

  it('executes searchMemories when searchQuery is populated', async () => {
    const searchResults: ipc.MemorySearchResult[] = [
      {
        memory: {
          id: 'mem-2',
          content: 'Working on Project X release notes',
          category: 'project',
          workspace_id: 'ws-123',
          created_at: 2000,
          updated_at: 2000,
        },
        score: 9.5,
      },
    ];
    vi.mocked(ipc.searchMemories).mockResolvedValueOnce(searchResults);

    useMemoryStore.getState().setSearchQuery('release notes');
    await useMemoryStore.getState().loadMemories();

    expect(ipc.searchMemories).toHaveBeenCalledWith('release notes', 'ws-123', false, 20);
    expect(useMemoryStore.getState().memories).toEqual([searchResults[0].memory]);
  });

  it('creates memory with active workspace ID and reloads', async () => {
    vi.mocked(ipc.addMemory).mockResolvedValueOnce({
      id: 'mem-new',
      content: 'Antigravity workspace setup',
      category: 'fact',
      workspace_id: 'ws-123',
      created_at: 3000,
      updated_at: 3000,
    });
    vi.mocked(ipc.listMemories).mockResolvedValueOnce([]);

    await useMemoryStore.getState().createMemory('Antigravity workspace setup', 'fact');

    expect(ipc.addMemory).toHaveBeenCalledWith('Antigravity workspace setup', 'fact', 'ws-123');
    expect(ipc.listMemories).toHaveBeenCalled();
  });

  it('edits memory and reloads store', async () => {
    vi.mocked(ipc.updateMemory).mockResolvedValueOnce({
      id: 'mem-1',
      content: 'Updated content',
      category: 'fact',
      workspace_id: 'ws-123',
      created_at: 1000,
      updated_at: 4000,
    });
    vi.mocked(ipc.listMemories).mockResolvedValueOnce([]);

    await useMemoryStore.getState().editMemory('mem-1', 'Updated content', 'fact');

    expect(ipc.updateMemory).toHaveBeenCalledWith('mem-1', 'Updated content', 'fact', 'ws-123');
    expect(ipc.listMemories).toHaveBeenCalled();
  });

  it('removes memory and reloads store', async () => {
    vi.mocked(ipc.deleteMemory).mockResolvedValueOnce(true);
    vi.mocked(ipc.listMemories).mockResolvedValueOnce([]);

    await useMemoryStore.getState().removeMemory('mem-1');

    expect(ipc.deleteMemory).toHaveBeenCalledWith('mem-1');
    expect(ipc.listMemories).toHaveBeenCalled();
  });

  it('handles IPC error gracefully and allows clearing error', async () => {
    vi.mocked(ipc.listMemories).mockRejectedValueOnce(new Error('SQLite lock conflict'));

    await useMemoryStore.getState().loadMemories();

    expect(useMemoryStore.getState().error).toBe('SQLite lock conflict');
    expect(useMemoryStore.getState().isLoading).toBe(false);

    useMemoryStore.getState().clearError();
    expect(useMemoryStore.getState().error).toBeNull();
  });
});
