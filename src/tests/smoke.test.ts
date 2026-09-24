import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ipc from '../lib/ipc';
import * as providers from '../lib/providers';
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

vi.mock('../lib/providers', () => ({
  chatWithActiveProvider: vi.fn(),
  getProvider: vi.fn(),
  getActiveProviderInfo: vi.fn().mockReturnValue({
    providerId: 'ollama',
    modelName: 'llama3.1',
    isLocal: true,
  }),
}));

describe('End-to-End Smoke Test: Core Interactive Loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      messages: [],
      isLoading: false,
      error: null,
      lastFailedPrompt: null,
      alwaysAllowedCommands: [],
      activeNudge: null,
      dismissedNudgeIds: [],
    });
    useSettingsStore.setState({
      activeTab: 'chat',
      activeProvider: 'ollama',
      ollamaModel: 'llama3.1',
      ambientProactive: false,
      activeWindowAwareness: false,
    });
    useWorkspaceStore.setState({
      activeWorkspace: {
        id: 'ws-default',
        name: 'General',
        icon: null,
        description: null,
        is_active: true,
        is_archived: false,
        created_at: 1000,
        updated_at: 1000,
      },
    });
  });

  it('verifies initial state and tab navigation', () => {
    const settings = useSettingsStore.getState();
    expect(settings.activeProvider).toBe('ollama');
    expect(settings.ollamaModel).toBe('llama3.1');
    expect(settings.activeTab).toBe('chat');

    // Test tab navigation
    settings.setActiveTab('memory');
    expect(useSettingsStore.getState().activeTab).toBe('memory');

    settings.setActiveTab('settings');
    expect(useSettingsStore.getState().activeTab).toBe('settings');

    settings.setActiveTab('chat');
    expect(useSettingsStore.getState().activeTab).toBe('chat');
  });

  it('runs complete lifecycle: send message -> stream response -> propose tool -> approve -> verify output', async () => {
    // 1. Mock streaming response from LLM proposing a tool
    vi.mocked(providers.chatWithActiveProvider).mockImplementation(async (_messages, options) => {
      // Simulate streaming chunks
      if (options?.onChunk) {
        options.onChunk('I will check the directory contents.');
        options.onChunk('\n\n<tool_call name="search_files">{"dir": "./src", "query": "App"}</tool_call>');
      }
      return 'I will check the directory contents.\n\n<tool_call name="search_files">{"dir": "./src", "query": "App"}</tool_call>';
    });

    // 2. Send message
    const sendPromise = useChatStore.getState().sendMessage('Find App file');
    await sendPromise;

    // Verify messages created (user message + assistant message)
    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(2);

    const userMsg = msgs[0];
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toBe('Find App file');

    const assistantMsg = msgs[1];
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.content).toContain('I will check the directory contents.');

    // 3. Verify tool execution proposed and in pending_approval state
    expect(assistantMsg.toolExecutions).toBeDefined();
    expect(assistantMsg.toolExecutions).toHaveLength(1);

    const tool = assistantMsg.toolExecutions![0];
    expect(tool.toolName).toBe('search_files');
    expect(tool.args).toEqual({ dir: './src', query: 'App' });
    expect(tool.status).toBe('pending_approval');

    // 4. Mock tool execution result
    const mockFiles: ipc.FileMatch[] = [
      { name: 'App.tsx', path: 'src/App.tsx', is_dir: false, size_bytes: 3834 },
      { name: 'App.css', path: 'src/App.css', is_dir: false, size_bytes: 60282 },
    ];
    vi.mocked(ipc.searchFiles).mockResolvedValueOnce(mockFiles);

    // 5. User approves tool execution
    await useChatStore.getState().approveToolExecution(assistantMsg.id, 0, false);

    // 6. Verify tool execution completed and output recorded
    expect(ipc.searchFiles).toHaveBeenCalledWith('./src', 'App');

    const updatedMsg = useChatStore.getState().messages.find((m) => m.id === assistantMsg.id);
    expect(updatedMsg).toBeDefined();
    expect(updatedMsg!.toolExecutions![0].status).toBe('completed');
    expect(updatedMsg!.toolExecutions![0].result).toEqual(mockFiles);
  });
});
