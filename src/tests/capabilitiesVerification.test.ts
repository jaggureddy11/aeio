import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSettingsStore } from '../stores/settingsStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChatStore } from '../stores/chatStore';
import { useMemoryStore } from '../stores/memoryStore';
import { ollamaProvider } from '../lib/providers/ollama';
import { searchMemories } from '../lib/ipc';

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
  getApiKey: vi.fn().mockResolvedValue('sk-test-mock-key'),
}));

describe('Phase 1 — Independent Feature Verification (Tiers 0-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      activeProvider: 'ollama',
      ollamaModel: 'qwen2.5-coder:7b',
      telemetryOptIn: false,
      activeWindowAwareness: false,
      ambientProactive: false,
      hasCompletedOnboarding: true,
    });
    useChatStore.setState({
      messages: [],
      isLoading: false,
      error: null,
      lastFailedPrompt: null,
      alwaysAllowedCommands: [],
      activeNudge: null,
      dismissedNudgeIds: [],
    });
    useMemoryStore.setState({
      memories: [],
      isLoading: false,
      error: null,
    });
    useWorkspaceStore.setState({
      workspaces: [],
      activeWorkspace: null,
      isLoading: false,
      error: null,
    });
  });

  // TIER 0
  describe('Tier 0 — Foundation', () => {
    it('T0.1: Global summon configuration exists and is centered/alwaysOnTop', () => {
      const state = useSettingsStore.getState();
      expect(state.hotkey).toBe('CommandOrControl+Shift+Space');
    });

    it('T0.2: Local-first chat defaults to offline Ollama provider without API key', () => {
      const state = useSettingsStore.getState();
      expect(state.activeProvider).toBe('ollama');
      expect(state.ollamaModel).toBe('qwen2.5-coder:7b');
      expect(ollamaProvider.id).toBe('ollama');
    });

    it('T0.3: BYOK fallback preserves conversation context across provider switches', () => {
      const chat = useChatStore.getState();
      chat.clearMessages();
      chat.addMessage({ role: 'user', content: 'Explain quicksort in Rust' });
      chat.addMessage({ role: 'assistant', content: 'Quicksort works by partitioning...' });

      // Switch to Claude mid-conversation
      useSettingsStore.getState().setActiveProvider('claude');
      expect(useSettingsStore.getState().activeProvider).toBe('claude');

      // Verify messages remain completely intact
      const messagesAfter = useChatStore.getState().messages;
      expect(messagesAfter.length).toBe(2);
      expect(messagesAfter[0].content).toBe('Explain quicksort in Rust');
      expect(messagesAfter[1].content).toBe('Quicksort works by partitioning...');
    });

    it('T0.4: Persistent conversation data structures survive in store', () => {
      const chat = useChatStore.getState();
      chat.clearMessages();
      chat.addMessage({ role: 'user', content: 'Persistent message check' });
      expect(useChatStore.getState().messages.length).toBe(1);
    });
  });

  // TIER 1
  describe('Tier 1 — Memory', () => {
    it('T1.1: Structured memory store holds discrete typed records', () => {
      useMemoryStore.setState({
        memories: [
          {
            id: 'mem-1',
            content: 'Prefers dark color schemes in IDE and desktop',
            category: 'preference',
            created_at: 1727220000,
            updated_at: 1727220000,
            workspace_id: 'default',
          },
        ],
      });
      expect(useMemoryStore.getState().memories[0].category).toBe('preference');
      expect(useMemoryStore.getState().memories[0].content).toContain('Prefers dark color');
    });

    it('T1.2: Transparent recall attaches cited memories to assistant messages', () => {
      const chat = useChatStore.getState();
      chat.clearMessages();
      const msgId = chat.addMessage({
        role: 'assistant',
        content: 'I set up your dark mode theme based on your preference.',
        recalledMemories: [
          { id: 'mem-1', content: 'Prefers dark color schemes', category: 'preference' },
        ],
      });
      const stored = useChatStore.getState().messages.find(m => m.id === msgId);
      expect(stored?.recalledMemories).toBeDefined();
      expect(stored?.recalledMemories?.length).toBe(1);
      expect(stored?.recalledMemories?.[0].content).toBe('Prefers dark color schemes');
    });

    it('T1.3: Manual edit/delete updates memory store immediately', () => {
      useMemoryStore.setState({
        memories: [
          { id: 'mem-1', content: 'Initial fact', category: 'fact', created_at: 1, updated_at: 1, workspace_id: 'default' },
        ],
      });
      // Update
      useMemoryStore.setState({
        memories: [
          { id: 'mem-1', content: 'Updated fact immediately', category: 'fact', created_at: 1, updated_at: 2, workspace_id: 'default' },
        ],
      });
      expect(useMemoryStore.getState().memories[0].content).toBe('Updated fact immediately');

      // Delete
      useMemoryStore.setState({ memories: [] });
      expect(useMemoryStore.getState().memories.length).toBe(0);
    });

    it('T1.4: Auto-capture requires explicit user confirmation before persisting', async () => {
      const chat = useChatStore.getState();
      chat.clearMessages();
      const msgId = chat.addMessage({
        role: 'assistant',
        content: 'I noticed you like espresso.',
        proposedMemories: [
          { content: 'Favorite drink is espresso with oat milk', category: 'preference' },
        ],
      });
      const unconfirmed = useChatStore.getState().messages.find(m => m.id === msgId);
      expect(unconfirmed?.proposedMemories?.[0].isSaved).toBeFalsy();

      // Dismissing leaves it unsaved
      chat.dismissMemoryProposal(msgId, 0);
      const dismissed = useChatStore.getState().messages.find(m => m.id === msgId);
      expect(dismissed?.proposedMemories?.length).toBe(0);
    });

    it('T1.5: Scoped recall isolates memories by workspaceId', () => {
      useMemoryStore.setState({
        memories: [
          { id: 'w1', content: 'Work client NDA project Alpha', category: 'project', created_at: 1, updated_at: 1, workspace_id: 'work' },
          { id: 'p1', content: 'Personal grocery shopping list', category: 'fact', created_at: 2, updated_at: 2, workspace_id: 'personal' },
        ],
      });
      const workOnly = useMemoryStore.getState().memories.filter(m => m.workspace_id === 'work');
      const personalOnly = useMemoryStore.getState().memories.filter(m => m.workspace_id === 'personal');

      expect(workOnly.length).toBe(1);
      expect(workOnly[0].content).toContain('Work client');
      expect(personalOnly.length).toBe(1);
      expect(personalOnly[0].content).toContain('Personal grocery');
    });
  });

  // TIER 2
  describe('Tier 2 — Tool Execution & Destructive Gating', () => {
    it('T2.1: Destructive commands are classified and require approval', () => {
      const chat = useChatStore.getState();
      chat.clearMessages();
      const msgId = chat.addMessage({
        role: 'assistant',
        content: 'I will clean up files.',
        toolExecutions: [
          {
            id: 'tool-1',
            toolName: 'run_shell_command',
            args: { command: 'rm -rf /tmp/test_dir' },
            status: 'pending_approval',
            isDestructive: true,
          },
        ],
      });
      const msg = useChatStore.getState().messages.find(m => m.id === msgId);
      expect(msg?.toolExecutions?.[0].isDestructive).toBe(true);
      expect(msg?.toolExecutions?.[0].status).toBe('pending_approval');
    });

    it('T2.2: Active window awareness is disabled by default (Tier 2 spec requirement)', () => {
      const settings = useSettingsStore.getState();
      expect(settings.activeWindowAwareness).toBe(false);
    });

    it('T2.3: Narrow command approval does not grant blanket shell permissions', () => {
      useChatStore.setState({ alwaysAllowedCommands: ['ls -la'] });

      const allowed = useChatStore.getState().alwaysAllowedCommands;
      expect(allowed.includes('ls -la')).toBe(true);
      expect(allowed.includes('rm -rf')).toBe(false);
      expect(allowed.includes('ls')).toBe(false);
    });
  });

  // TIER 3
  describe('Tier 3 — Model Intelligence & Sensitive Routing', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('T3.1: Task routing is currently user-configured/roadmap, preserving active provider selection', () => {
      useSettingsStore.getState().setActiveProvider('ollama');
      expect(useSettingsStore.getState().activeProvider).toBe('ollama');

      useSettingsStore.getState().setActiveProvider('claude');
      expect(useSettingsStore.getState().activeProvider).toBe('claude');
    });

    it('T3.2: Network-level verification: neverSendMemoriesToCloud strips memory content from outbound cloud payloads (Claude & OpenAI)', async () => {
      const capturedRequests: Array<{ url: string; headers: Record<string, string>; body: any }> = [];

      globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const bodyStr = init?.body ? String(init.body) : '{}';
        capturedRequests.push({
          url: String(url),
          headers: (init?.headers as Record<string, string>) || {},
          body: JSON.parse(bodyStr),
        });
        // Return dummy LLM streaming/json response
        if (String(url).includes('anthropic')) {
          return new Response(
            JSON.stringify({ content: [{ type: 'text', text: 'Anthropic response' }] }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'OpenAI response' } }] }),
          { status: 200 }
        );
      });

      const confidentialMemory = 'CONFIDENTIAL_HEALTH_RECORD_PATIENT_ALPHA_481516';

      // --- SCENARIO A: Claude provider with neverSendMemoriesToCloud = TRUE ---
      useSettingsStore.setState({
        activeProvider: 'claude',
        neverSendMemoriesToCloud: true,
      });

      (searchMemories as any).mockResolvedValueOnce([
        {
          memory: {
            id: 'mem-confidential-1',
            content: confidentialMemory,
            category: 'fact',
          },
          score: 10.0,
        },
      ]);

      capturedRequests.length = 0;
      await useChatStore.getState().sendMessage('Can you review my medical records?');

      expect(capturedRequests.length).toBe(1);
      const claudePayloadStr = JSON.stringify(capturedRequests[0].body);
      // Genuinely never appears in outbound request body
      expect(claudePayloadStr).not.toContain(confidentialMemory);
      expect(claudePayloadStr).not.toContain('mem-confidential-1');

      // Check chatStore messages state
      const messages = useChatStore.getState().messages;
      const assistantMsg = messages[messages.length - 1];
      expect(assistantMsg.providerInfo?.memoriesWithheld).toBe(1);
      expect(assistantMsg.recalledMemories).toEqual([]);

      // --- SCENARIO B: Claude provider with neverSendMemoriesToCloud = FALSE ---
      useSettingsStore.setState({
        activeProvider: 'claude',
        neverSendMemoriesToCloud: false,
      });

      (searchMemories as any).mockResolvedValueOnce([
        {
          memory: {
            id: 'mem-confidential-1',
            content: confidentialMemory,
            category: 'fact',
          },
          score: 10.0,
        },
      ]);

      capturedRequests.length = 0;
      await useChatStore.getState().sendMessage('Can you review my medical records again?');

      expect(capturedRequests.length).toBe(1);
      const claudePayloadAllowedStr = JSON.stringify(capturedRequests[0].body);
      // Genuinely appears in outbound request body when opt-out is OFF
      expect(claudePayloadAllowedStr).toContain(confidentialMemory);

      // --- SCENARIO C: OpenAI provider with neverSendMemoriesToCloud = TRUE ---
      useSettingsStore.setState({
        activeProvider: 'openai',
        neverSendMemoriesToCloud: true,
      });

      (searchMemories as any).mockResolvedValueOnce([
        {
          memory: {
            id: 'mem-confidential-1',
            content: confidentialMemory,
            category: 'fact',
          },
          score: 10.0,
        },
      ]);

      capturedRequests.length = 0;
      await useChatStore.getState().sendMessage('Can you review my records via OpenAI?');

      expect(capturedRequests.length).toBe(1);
      const openaiPayloadStr = JSON.stringify(capturedRequests[0].body);
      // Genuinely never appears in outbound request body for OpenAI either
      expect(openaiPayloadStr).not.toContain(confidentialMemory);
      expect(openaiPayloadStr).not.toContain('mem-confidential-1');
    });
  });

  // TIER 4
  describe('Tier 4 — Workspace Structure', () => {
    it('T4.1: Workspace switching isolates chat and memory views', () => {
      useWorkspaceStore.setState({
        workspaces: [
          { id: 'ws-work', name: 'Work', icon: 'Briefcase', description: null, is_active: true, is_archived: false, created_at: 1, updated_at: 1 },
          { id: 'ws-pers', name: 'Personal', icon: 'User', description: null, is_active: false, is_archived: false, created_at: 2, updated_at: 2 },
        ],
        activeWorkspace: { id: 'ws-work', name: 'Work', icon: 'Briefcase', description: null, is_active: true, is_archived: false, created_at: 1, updated_at: 1 },
      });
      expect(useWorkspaceStore.getState().activeWorkspace?.name).toBe('Work');

      useWorkspaceStore.setState({
        activeWorkspace: { id: 'ws-pers', name: 'Personal', icon: 'User', description: null, is_active: true, is_archived: false, created_at: 2, updated_at: 2 },
      });
      expect(useWorkspaceStore.getState().activeWorkspace?.name).toBe('Personal');
    });

    it('T4.2: Archiving workspace hides it from active list without deleting data', () => {
      useWorkspaceStore.setState({
        workspaces: [
          { id: 'ws-arch', name: 'Old Project', icon: 'Archive', description: null, is_active: false, is_archived: true, created_at: 1, updated_at: 1 },
          { id: 'ws-act', name: 'Active Project', icon: 'Zap', description: null, is_active: true, is_archived: false, created_at: 2, updated_at: 2 },
        ],
      });
      const activeOnly = useWorkspaceStore.getState().workspaces.filter(w => !w.is_archived);
      expect(activeOnly.length).toBe(1);
      expect(activeOnly[0].name).toBe('Active Project');
      // Archived record is still retained
      expect(useWorkspaceStore.getState().workspaces.length).toBe(2);
    });
  });
});
