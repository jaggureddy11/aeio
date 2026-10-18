import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
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

describe('Chat View Scroll and Assistant Action Capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      messages: [],
      isLoading: false,
      error: null,
      lastFailedPrompt: null,
    });
    useSettingsStore.setState({
      activeTab: 'chat',
      activeProvider: 'claude',
      neverSendMemoriesToCloud: false,
    });
    useWorkspaceStore.setState({
      activeWorkspace: {
        id: 'ws-1',
        name: 'Dev Workspace',
        rootPath: '/tmp',
        createdAt: 0,
        updatedAt: 0,
      },
    });
  });

  it('exposes retryLastMessage method on chatStore for assistant action row retry button', async () => {
    const chatStore = useChatStore.getState();
    expect(typeof chatStore.retryLastMessage).toBe('function');
  });

  it('allows adding and managing messages with role and providerInfo', () => {
    const assistantMsg = {
      id: 'msg-test',
      role: 'assistant' as const,
      content: 'Hello, I am Aeio with Claude styling.',
      timestamp: Date.now(),
      providerInfo: {
        providerId: 'claude',
        modelName: 'claude-3-5-sonnet',
        isLocal: false,
      },
    };

    useChatStore.setState({
      messages: [assistantMsg],
    });

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe('assistant');
    expect(state.messages[0].providerInfo?.modelName).toBe('claude-3-5-sonnet');
  });
});
