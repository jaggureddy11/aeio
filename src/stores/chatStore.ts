import { create } from 'zustand';
import { chatWithActiveProvider, ProviderMessage } from '../lib/providers';
import { useSettingsStore } from './settingsStore';
import { useWorkspaceStore } from './workspaceStore';
import {
  addMemory,
  MemoryCategory,
  searchMemories,
  readFile,
  searchFiles,
  readClipboard,
  writeClipboard,
  runShellCommand,
  checkDestructiveCommand,
  openTarget,
  getActiveWindow,
  ActiveWindowInfo,
  saveChatMessage,
  loadChatMessages,
  clearChatHistory,
} from '../lib/ipc';

export interface RecalledMemory {
  id: string;
  content: string;
  category: string;
}

export interface ProposedMemory {
  content: string;
  category: MemoryCategory;
  isSaved?: boolean;
}

export interface ToolExecution {
  id: string;
  toolName: string;
  args: Record<string, any>;
  status: 'pending_approval' | 'approved' | 'running' | 'completed' | 'denied' | 'error';
  isDestructive?: boolean;
  result?: any;
  error?: string;
}

export interface ProviderBadgeInfo {
  providerId: string;
  modelName: string;
  isLocal: boolean;
  isPrivacyProtected?: boolean;
}

export interface ProactiveNudge {
  id: string;
  type: 'repeat_pattern' | 'relevant_memory' | 'workspace_suggestion';
  title: string;
  suggestion: string;
  actionPrompt?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  recalledMemories?: RecalledMemory[];
  proposedMemories?: ProposedMemory[];
  toolExecutions?: ToolExecution[];
  providerInfo?: ProviderBadgeInfo;
  workspaceId?: string;
  activeWindowContext?: ActiveWindowInfo;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  lastFailedPrompt: string | null;
  alwaysAllowedCommands: string[];
  activeNudge: ProactiveNudge | null;
  dismissedNudgeIds: string[];
  initChatHistory: (workspaceId?: string) => Promise<void>;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessageContent: (
    id: string,
    content: string,
    isStreaming?: boolean,
    recalled?: RecalledMemory[],
    proposed?: ProposedMemory[],
    tools?: ToolExecution[],
    providerInfo?: ProviderBadgeInfo,
    activeWindowContext?: ActiveWindowInfo
  ) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  sendMessage: (userContent: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  switchToLocalAndRetry: () => Promise<void>;
  confirmMemoryProposal: (messageId: string, index: number) => Promise<void>;
  dismissMemoryProposal: (messageId: string, index: number) => void;
  approveToolExecution: (
    messageId: string,
    index: number,
    alwaysAllow?: boolean
  ) => Promise<void>;
  denyToolExecution: (messageId: string, index: number) => void;
  dismissNudge: (id: string) => void;
  applyNudge: (nudge: ProactiveNudge) => Promise<void>;
  checkForAmbientNudge: () => Promise<void>;
}

const REMEMBER_REGEX =
  /<remember\s+category=["']?(fact|preference|project|person)["']?>([\s\S]*?)<\/remember>/gi;

const TOOL_CALL_REGEX =
  /<tool_call\s+name=["']?([^"'\s>]+)["']?(?:\s+args=(?:'([^']*)'|"([^"]*)"))?\s*(?:\/>|>([\s\S]*?)<\/tool_call>)/gi;

function persistChatMessage(msg: ChatMessage) {
  const activeWs = useWorkspaceStore.getState().activeWorkspace;
  const wsId = msg.workspaceId || activeWs?.id || 'default';

  saveChatMessage({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    recalled_memories_json: msg.recalledMemories ? JSON.stringify(msg.recalledMemories) : null,
    proposed_memories_json: msg.proposedMemories ? JSON.stringify(msg.proposedMemories) : null,
    tool_executions_json: msg.toolExecutions ? JSON.stringify(msg.toolExecutions) : null,
    provider_info_json: msg.providerInfo ? JSON.stringify(msg.providerInfo) : null,
    workspace_id: wsId,
    timestamp: msg.timestamp,
  }).catch((err) => console.warn('Failed to persist chat message to SQLite:', err));
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,
  lastFailedPrompt: null,
  alwaysAllowedCommands: [],
  activeNudge: null,
  dismissedNudgeIds: [],

  initChatHistory: async (workspaceId?: string) => {
    try {
      const activeWs = useWorkspaceStore.getState().activeWorkspace;
      const wsId = workspaceId || activeWs?.id || 'default';
      const saved = await loadChatMessages(wsId, 100);
      if (saved) {
        const parsed: ChatMessage[] = saved.map((s) => ({
          id: s.id,
          role: s.role as 'user' | 'assistant' | 'system',
          content: s.content,
          timestamp: s.timestamp,
          recalledMemories: s.recalled_memories_json
            ? JSON.parse(s.recalled_memories_json)
            : undefined,
          proposedMemories: s.proposed_memories_json
            ? JSON.parse(s.proposed_memories_json)
            : undefined,
          toolExecutions: s.tool_executions_json
            ? JSON.parse(s.tool_executions_json)
            : undefined,
          providerInfo: s.provider_info_json
            ? JSON.parse(s.provider_info_json)
            : undefined,
          workspaceId: s.workspace_id || undefined,
        }));
        set({ messages: parsed });
      }
    } catch (err) {
      console.warn('Failed to load chat history from SQLite:', err);
    }
  },

  addMessage: (message) => {
    const activeWs = useWorkspaceStore.getState().activeWorkspace;
    const wsId = message.workspaceId || activeWs?.id || 'default';

    const id = crypto.randomUUID();
    const newMessage: ChatMessage = {
      ...message,
      id,
      timestamp: Date.now(),
      workspaceId: wsId,
    };
    set((state) => ({ messages: [...state.messages, newMessage] }));

    // Persist complete user or assistant message to SQLite
    if (!message.isStreaming) {
      persistChatMessage(newMessage);
    }

    return id;
  },

  updateMessageContent: (
    id,
    content,
    isStreaming,
    recalled,
    proposed,
    tools,
    providerInfo,
    activeWindowContext
  ) => {
    set((state) => {
      const updatedMessages = state.messages.map((m) => {
        if (m.id === id) {
          const updated: ChatMessage = {
            ...m,
            content,
            isStreaming: isStreaming !== undefined ? isStreaming : m.isStreaming,
            recalledMemories: recalled !== undefined ? recalled : m.recalledMemories,
            proposedMemories: proposed !== undefined ? proposed : m.proposedMemories,
            toolExecutions: tools !== undefined ? tools : m.toolExecutions,
            providerInfo: providerInfo !== undefined ? providerInfo : m.providerInfo,
            activeWindowContext:
              activeWindowContext !== undefined ? activeWindowContext : m.activeWindowContext,
          };
          if (!isStreaming) {
            persistChatMessage(updated);
          }
          return updated;
        }
        return m;
      });
      return { messages: updatedMessages };
    });
  },

  setError: (error) => set({ error }),

  clearMessages: async () => {
    const activeWs = useWorkspaceStore.getState().activeWorkspace;
    const wsId = activeWs?.id || 'default';
    set({ messages: [], activeNudge: null });
    try {
      await clearChatHistory(wsId);
    } catch (err) {
      console.warn('Failed to clear chat history in SQLite:', err);
    }
  },

  confirmMemoryProposal: async (messageId: string, index: number) => {
    const message = get().messages.find((m) => m.id === messageId);
    if (!message || !message.proposedMemories) return;

    const proposal = message.proposedMemories[index];
    if (!proposal || proposal.isSaved) return;

    const activeWs = useWorkspaceStore.getState().activeWorkspace;
    const wsId = activeWs?.id || 'default';

    try {
      await addMemory(
        proposal.content,
        proposal.category,
        wsId
      );

      const updatedProposals = [...message.proposedMemories];
      updatedProposals[index] = { ...proposal, isSaved: true };

      get().updateMessageContent(
        messageId,
        message.content,
        message.isStreaming,
        message.recalledMemories,
        updatedProposals,
        message.toolExecutions,
        message.providerInfo,
        message.activeWindowContext
      );
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      console.error('Failed to commit proposed memory:', err);
      set({ error: `Memory persistence failure: ${errStr}` });
    }
  },

  switchToLocalAndRetry: async () => {
    useSettingsStore.getState().setActiveProvider('ollama');
    set({ error: null });
    await get().retryLastMessage();
  },

  dismissMemoryProposal: (messageId: string, index: number) => {
    const message = get().messages.find((m) => m.id === messageId);
    if (!message || !message.proposedMemories) return;

    const updatedProposals = message.proposedMemories.filter((_, i) => i !== index);

    get().updateMessageContent(
      messageId,
      message.content,
      message.isStreaming,
      message.recalledMemories,
      updatedProposals,
      message.toolExecutions,
      message.providerInfo,
      message.activeWindowContext
    );
  },

  approveToolExecution: async (messageId: string, index: number, alwaysAllow = false) => {
    const message = get().messages.find((m) => m.id === messageId);
    if (!message || !message.toolExecutions) return;

    const execution = message.toolExecutions[index];
    if (!execution || execution.status !== 'pending_approval') return;

    // Set state to running
    const runningTools = [...message.toolExecutions];
    runningTools[index] = { ...execution, status: 'running' };
    get().updateMessageContent(
      messageId,
      message.content,
      message.isStreaming,
      message.recalledMemories,
      message.proposedMemories,
      runningTools,
      message.providerInfo,
      message.activeWindowContext
    );

    try {
      let result: any = null;
      switch (execution.toolName) {
        case 'run_shell': {
          result = await runShellCommand(execution.args.command, execution.args.cwd);
          break;
        }
        case 'read_file': {
          result = await readFile(execution.args.path);
          break;
        }
        case 'search_files': {
          result = await searchFiles(
            execution.args.dir || './',
            execution.args.query || ''
          );
          break;
        }
        case 'read_clipboard': {
          result = await readClipboard();
          break;
        }
        case 'write_clipboard': {
          await writeClipboard(execution.args.text || '');
          result = 'Content written to clipboard';
          break;
        }
        case 'open_target': {
          const target =
            execution.args.target ||
            execution.args.path ||
            execution.args.url ||
            '';
          result = await openTarget(target);
          break;
        }
        default:
          throw new Error(`Unknown tool: ${execution.toolName}`);
      }

      // If user enabled always allow and it's NOT destructive, add to session cache
      if (alwaysAllow && !execution.isDestructive) {
        const cmdKey = execution.args.command;
        const scopedKey = `${execution.toolName}:${cmdKey || execution.args.path || execution.args.target || 'default'}`;
        set((state) => ({
          alwaysAllowedCommands: Array.from(
            new Set([...state.alwaysAllowedCommands, scopedKey, ...(cmdKey ? [cmdKey] : [])])
          ),
        }));
      }

      // Update execution status to completed
      const completedTools = [...get().messages.find((m) => m.id === messageId)!.toolExecutions!];
      completedTools[index] = {
        ...execution,
        status: 'completed',
        result,
      };

      get().updateMessageContent(
        messageId,
        message.content,
        message.isStreaming,
        message.recalledMemories,
        message.proposedMemories,
        completedTools,
        message.providerInfo,
        message.activeWindowContext
      );
    } catch (err: unknown) {
      const errorStr = err instanceof Error ? err.message : String(err);
      const errorTools = [...get().messages.find((m) => m.id === messageId)!.toolExecutions!];
      errorTools[index] = {
        ...execution,
        status: 'error',
        error: errorStr,
      };

      get().updateMessageContent(
        messageId,
        message.content,
        message.isStreaming,
        message.recalledMemories,
        message.proposedMemories,
        errorTools,
        message.providerInfo,
        message.activeWindowContext
      );
    }
  },

  denyToolExecution: (messageId: string, index: number) => {
    const message = get().messages.find((m) => m.id === messageId);
    if (!message || !message.toolExecutions) return;

    const deniedTools = [...message.toolExecutions];
    deniedTools[index] = { ...deniedTools[index], status: 'denied' };

    get().updateMessageContent(
      messageId,
      message.content,
      message.isStreaming,
      message.recalledMemories,
      message.proposedMemories,
      deniedTools,
      message.providerInfo,
      message.activeWindowContext
    );
  },

  dismissNudge: (id: string) => {
    set((state) => ({
      activeNudge: null,
      dismissedNudgeIds: [...state.dismissedNudgeIds, id],
    }));
  },

  applyNudge: async (nudge: ProactiveNudge) => {
    get().dismissNudge(nudge.id);
    if (nudge.actionPrompt) {
      await get().sendMessage(nudge.actionPrompt);
    }
  },

  checkForAmbientNudge: async () => {
    const isAmbientOn = useSettingsStore.getState().ambientProactive;
    if (!isAmbientOn) {
      if (get().activeNudge) {
        set({ activeNudge: null });
      }
      return;
    }

    const msgs = get().messages;
    const dismissed = get().dismissedNudgeIds;
    const activeWs = useWorkspaceStore.getState().activeWorkspace;
    const wsId = activeWs?.id || 'default';

    // 1. Check for repeated questions or topics in recent messages
    const userMsgs = msgs.filter((m) => m.role === 'user');
    if (userMsgs.length >= 2) {
      const last = userMsgs[userMsgs.length - 1].content.trim().toLowerCase();
      const prev = userMsgs[userMsgs.length - 2].content.trim().toLowerCase();

      const lastWords = new Set(last.split(/\s+/));
      const commonWords = prev.split(/\s+/).filter((w) => w.length > 3 && lastWords.has(w));

      if (commonWords.length >= 2) {
        const nudgeId = `repeat_${wsId}_${commonWords.slice(0, 3).join('_')}`;
        if (!dismissed.includes(nudgeId)) {
          set({
            activeNudge: {
              id: nudgeId,
              type: 'repeat_pattern',
              title: 'Iterative Pattern Noticed',
              suggestion: `You've queried about "${commonWords.join(' ')}". Save summary as permanent workspace note?`,
              actionPrompt: `Summarize our conversation about ${commonWords.join(' ')} into a concise project note and remember it.`,
            },
          });
          return;
        }
      }
    }

    // 2. Check for relevant workspace memories that could assist
    if (userMsgs.length > 0) {
      const latestMsg = userMsgs[userMsgs.length - 1].content;
      try {
        const mems = await searchMemories(latestMsg, wsId, false, 3);
        const topMem = mems.find((m) => m.score >= 0.8);
        if (topMem) {
          const nudgeId = `mem_${topMem.memory.id}`;
          if (!dismissed.includes(nudgeId)) {
            set({
              activeNudge: {
                id: nudgeId,
                type: 'relevant_memory',
                title: 'Relevant Memory Found',
                suggestion: `Recall from your notes: "${topMem.memory.content}". Would you like to use this context?`,
                actionPrompt: `Use our saved memory: "${topMem.memory.content}" to expand on this.`,
              },
            });
            return;
          }
        }
      } catch {}
    }
  },

  retryLastMessage: async () => {
    const prompt = get().lastFailedPrompt;
    if (!prompt) return;
    set({ error: null });
    await get().sendMessage(prompt);
  },

  sendMessage: async (userContent: string) => {
    const trimmed = userContent.trim();
    if (!trimmed || get().isLoading) return;

    set({ error: null, lastFailedPrompt: trimmed, activeNudge: null });

    const activeWs = useWorkspaceStore.getState().activeWorkspace;
    const wsId = activeWs?.id || 'default';

    // 1. Add user message
    get().addMessage({
      role: 'user',
      content: trimmed,
      workspaceId: wsId,
    });

    // 2. Search relevant memories strictly scoped to active workspace (Tier 1 & Tier 4 Scoped Recall)
    let recalled: RecalledMemory[] = [];
    try {
      const searchResults = await searchMemories(trimmed, wsId, false, 4);
      recalled = searchResults
        .filter((r) => r.score >= 1.0)
        .map((r) => ({
          id: r.memory.id,
          content: r.memory.content,
          category: r.memory.category,
        }));
    } catch (err) {
      console.warn('Memory search before prompt failed:', err);
    }

    // 3. Provider info & sensitivity calculation
    const settings = useSettingsStore.getState();
    const providerId = settings.activeProvider;
    const modelName =
      providerId === 'ollama'
        ? settings.ollamaModel || 'llama3.2'
        : providerId === 'claude'
        ? 'claude-3-5-sonnet'
        : 'gpt-4o';
    const isLocal = providerId === 'ollama';
    const providerInfo: ProviderBadgeInfo = {
      providerId,
      modelName,
      isLocal,
      isPrivacyProtected: isLocal || recalled.length > 0,
    };

    // 4. Active Window Awareness (Tier 2 Opt-in)
    let activeWinInfo: ActiveWindowInfo | undefined = undefined;
    if (settings.activeWindowAwareness) {
      try {
        const info = await getActiveWindow();
        if (info && (info.app_name || info.title)) {
          activeWinInfo = info;
        }
      } catch (err) {
        console.warn('Failed to retrieve active window context:', err);
      }
    }

    // 5. Build system prompt with memories, active window context, and tool specifications
    let systemPrompt =
      'You are Aeio, an intelligent, helpful, and concise local-first desktop AI assistant.';

    if (activeWs) {
      systemPrompt += `\nCurrent Workspace: "${activeWs.name}". Keep context focused on this workspace.`;
    }

    if (activeWinInfo) {
      systemPrompt += `\n\nActive Window Context (Opt-in enabled): The user currently has application "${activeWinInfo.app_name}" focused (Window title: "${activeWinInfo.title}").`;
    }

    if (recalled.length > 0) {
      systemPrompt +=
        '\n\nRelevant user memories from the local memory store:\n' +
        recalled.map((m) => `- [${m.category}] ${m.content}`).join('\n');
    }

    systemPrompt +=
      '\n\nIf the user shares an enduring personal fact, preference, project detail, or contact, propose remembering it using: <remember category="fact|preference|project|person">The concise memory text</remember>. Only remember genuine facts, not transient statements.';

    systemPrompt +=
      '\n\nYou have access to local host tools. When the user requests host actions (reading files, searching files, inspecting or writing clipboard, opening files/URLs/apps, or running shell commands), output the corresponding XML tool call tag:' +
      '\n- Run shell: <tool_call name="run_shell" args=\'{"command":"..."}\'></tool_call>' +
      '\n- Read file: <tool_call name="read_file" args=\'{"path":"..."}\'></tool_call>' +
      '\n- Search directory: <tool_call name="search_files" args=\'{"dir":".","query":"..."}\'></tool_call>' +
      '\n- Open file/app/URL: <tool_call name="open_target" args=\'{"target":"..."}\'></tool_call>' +
      '\n- Read clipboard: <tool_call name="read_clipboard" args=\'{}\'></tool_call>' +
      '\n- Write clipboard: <tool_call name="write_clipboard" args=\'{"text":"..."}\'></tool_call>' +
      '\nAlways explain what you are doing in plain text alongside the tool call.';

    // 6. Prepare conversation messages for provider
    const conversation: ProviderMessage[] = get().messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 7. Add assistant placeholder
    const assistantId = get().addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
      recalledMemories: recalled,
      providerInfo,
      workspaceId: wsId,
      activeWindowContext: activeWinInfo,
    });

    set({ isLoading: true });

    let rawStreamed = '';

    try {
      await chatWithActiveProvider(conversation, {
        systemPrompt,
        onChunk: (chunk) => {
          rawStreamed += chunk;
          const cleanDisplay = rawStreamed
            .replace(REMEMBER_REGEX, '')
            .replace(TOOL_CALL_REGEX, '')
            .trim();
          get().updateMessageContent(
            assistantId,
            cleanDisplay || '...',
            true,
            recalled,
            undefined,
            undefined,
            providerInfo,
            activeWinInfo
          );
        },
      });

      // 8. Parse completed response for memory proposals
      const proposed: ProposedMemory[] = [];
      let remMatch;
      const remRegex = new RegExp(REMEMBER_REGEX.source, 'gi');
      while ((remMatch = remRegex.exec(rawStreamed)) !== null) {
        const cat = remMatch[1].toLowerCase() as MemoryCategory;
        const text = remMatch[2].trim();
        if (text) {
          proposed.push({ category: cat, content: text, isSaved: false });
        }
      }

      // 9. Parse completed response for tool execution requests
      const tools: ToolExecution[] = [];
      let toolMatch;
      const tRegex = new RegExp(TOOL_CALL_REGEX.source, 'gi');
      while ((toolMatch = tRegex.exec(rawStreamed)) !== null) {
        const name = toolMatch[1].trim();
        const argsStr = toolMatch[2] || toolMatch[3] || toolMatch[4] || '{}';
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(argsStr.trim());
        } catch {
          args = { raw: argsStr.trim() };
        }

        let isDestructive = false;
        if (name === 'run_shell' && args.command) {
          try {
            isDestructive = await checkDestructiveCommand(args.command);
          } catch {
            // Fail-safe: require explicit confirmation if check encounters an error
            isDestructive = true;
          }
        }

        tools.push({
          id: crypto.randomUUID(),
          toolName: name,
          args,
          status: 'pending_approval',
          isDestructive,
        });
      }

      const finalText = rawStreamed
        .replace(REMEMBER_REGEX, '')
        .replace(TOOL_CALL_REGEX, '')
        .trim();

      get().updateMessageContent(
        assistantId,
        finalText || rawStreamed,
        false,
        recalled,
        proposed,
        tools,
        providerInfo,
        activeWinInfo
      );

      // 10. Auto-execute any non-destructive tools that are already marked "always allow"
      if (tools.length > 0) {
        const allowed = get().alwaysAllowedCommands;
        for (let i = 0; i < tools.length; i++) {
          const t = tools[i];
          if (!t.isDestructive) {
            const cmdKey = t.args.command;
            const scopedKey = `${t.toolName}:${cmdKey || t.args.path || t.args.target || 'default'}`;
            if ((cmdKey && allowed.includes(cmdKey)) || allowed.includes(scopedKey)) {
              get().approveToolExecution(assistantId, i);
            }
          }
        }
      }

      // Success: clear last failed prompt
      set({ lastFailedPrompt: null });

      // Trigger ambient nudge check if opt-in enabled
      get().checkForAmbientNudge();
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Failed to receive response from provider.';

      let actionableError = errorMsg;
      if (
        errorMsg.includes('Failed to fetch') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('11434')
      ) {
        if (providerInfo.providerId === 'ollama') {
          actionableError =
            'Ollama is offline or unreachable on localhost:11434. Make sure Ollama is running (`ollama serve`).';
        } else {
          actionableError = `Network connection offline while connecting to ${providerInfo.providerId.toUpperCase()}. You can switch to local Ollama.`;
        }
      }

      if (!rawStreamed) {
        get().updateMessageContent(
          assistantId,
          `**Connection Issue**: ${actionableError}`,
          false,
          recalled,
          undefined,
          undefined,
          providerInfo,
          activeWinInfo
        );
      } else {
        get().updateMessageContent(
          assistantId,
          `${rawStreamed}\n\n*[Response interrupted: ${actionableError}]*`,
          false,
          recalled,
          undefined,
          undefined,
          providerInfo,
          activeWinInfo
        );
      }
      set({ error: actionableError, lastFailedPrompt: trimmed });
    } finally {
      set({ isLoading: false });
    }
  },
}));
