import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore, deriveSessionTitle } from '../stores/chatStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

vi.mock('../lib/ipc', () => ({
  addMemory: vi.fn(),
  searchMemories: vi.fn().mockResolvedValue([]),
  listMemories: vi.fn().mockResolvedValue([]),
  readFile: vi.fn(),
  searchFiles: vi.fn(),
  readClipboard: vi.fn(),
  writeClipboard: vi.fn(),
  runShellCommand: vi.fn(),
  checkDestructiveCommand: vi.fn().mockResolvedValue(false),
  openTarget: vi.fn(),
  getActiveWindow: vi.fn().mockResolvedValue(null),
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  loadChatMessages: vi.fn().mockResolvedValue([]),
  clearChatHistory: vi.fn().mockResolvedValue(undefined),
  listWorkspaces: vi.fn().mockResolvedValue([]),
  getActiveWorkspace: vi.fn(),
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  archiveWorkspace: vi.fn(),
  setActiveWorkspace: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
}));

describe('Multi-Session Chat Capabilities', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = {};
    globalThis.localStorage = {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        mockStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[k];
      },
      clear: () => {
        mockStorage = {};
      },
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
      length: 0,
    };

    useChatStore.setState({
      messages: [],
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      error: null,
    });

    useWorkspaceStore.setState({
      activeWorkspace: {
        id: 'ws-default',
        name: 'Default Workspace',
        icon: '💼',
        description: '',
        is_active: true,
        is_archived: false,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    });
  });

  it('derives readable session titles from user messages', () => {
    const title = deriveSessionTitle([
      {
        id: '1',
        role: 'user',
        content: 'Explain how quantum entanglement works in simple terms',
        timestamp: Date.now(),
      },
    ]);
    expect(title).toBe('Explain how quantum entanglement wor...');
  });

  it('initializes with a default session if storage is empty', async () => {
    await useChatStore.getState().initChatHistory();
    const state = useChatStore.getState();
    expect(state.sessions.length).toBeGreaterThanOrEqual(1);
    expect(state.activeSessionId).toBe(state.sessions[0].id);
    expect(state.messages).toEqual([]);
  });

  it('automatically auto-names session upon adding first user message', () => {
    const sessionId = useChatStore.getState().createNewSession();
    expect(sessionId).toBeTruthy();

    useChatStore.getState().addMessage({
      role: 'user',
      content: 'Write a python script to parse CSV files',
    });

    const state = useChatStore.getState();
    const activeSession = state.sessions.find((s) => s.id === state.activeSessionId);
    expect(activeSession?.title).toBe('Write a python script to parse CSV f...');
    expect(state.messages).toHaveLength(1);
  });

  it('allows creating multiple discrete chat sessions and switching between them', () => {
    // Session 1
    const session1Id = useChatStore.getState().createNewSession();
    useChatStore.getState().addMessage({
      role: 'user',
      content: 'Session 1: Tell me about astrophysics',
    });
    useChatStore.getState().addMessage({
      role: 'assistant',
      content: 'Astrophysics is a branch of space science...',
    });

    // Session 2
    const session2Id = useChatStore.getState().createNewSession();
    expect(session2Id).not.toBe(session1Id);
    expect(useChatStore.getState().messages).toHaveLength(0);

    useChatStore.getState().addMessage({
      role: 'user',
      content: 'Session 2: Recommend dinner recipes',
    });

    expect(useChatStore.getState().sessions).toHaveLength(2);
    expect(useChatStore.getState().messages).toHaveLength(1);

    // Switch back to Session 1
    useChatStore.getState().switchSession(session1Id);
    expect(useChatStore.getState().activeSessionId).toBe(session1Id);
    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(useChatStore.getState().messages[0].content).toContain('astrophysics');

    // Switch back to Session 2
    useChatStore.getState().switchSession(session2Id);
    expect(useChatStore.getState().activeSessionId).toBe(session2Id);
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().messages[0].content).toContain('dinner recipes');
  });

  it('deletes a session and safely switches to remaining or fresh session', () => {
    const session1 = useChatStore.getState().createNewSession();
    useChatStore.getState().addMessage({ role: 'user', content: 'Chat 1' });

    const session2 = useChatStore.getState().createNewSession();
    useChatStore.getState().addMessage({ role: 'user', content: 'Chat 2' });

    expect(useChatStore.getState().sessions).toHaveLength(2);

    // Delete active session2
    useChatStore.getState().deleteSession(session2);

    const state = useChatStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].id).toBe(session1);
    expect(state.activeSessionId).toBe(session1);
    expect(state.messages[0].content).toBe('Chat 1');
  });
});
