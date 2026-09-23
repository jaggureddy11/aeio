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
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  lastFailedPrompt: string | null;
  alwaysAllowedCommands: string[];
  initChatHistory: (workspaceId?: string) => Promise<void>;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessageContent: (
    id: string,
    content: string,
    isStreaming?: boolean,
    recalled?: RecalledMemory[],
    proposed?: ProposedMemory[],
    tools?: ToolExecution[],
    providerInfo?: ProviderBadgeInfo
  ) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  sendMessage: (userContent: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  confirmMemoryProposal: (messageId: string, index: number) => Promise<void>;
  dismissMemoryProposal: (messageId: string, index: number) => void;
  approveToolExecution: (
    messageId: string,
    index: number,
    alwaysAllow?: boolean
  ) => Promise<void>;
  denyToolExecution: (messageId: string, index: number) => void;
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
          workspaceId: s.workspace_id || wsId,
        }));
        set({ messages: parsed, error: null });
      } else {
        set({ messages: [], error: null });
      }
    } catch (err) {
      console.warn('Failed to load chat history from SQLite:', err);
    }
  },

  addMessage: (msg) => {
    const id = crypto.randomUUID();
    const activeWs = useWorkspaceStore.getState().activeWorkspace;
    const newMsg: ChatMessage = {
      ...msg,
      id,
      timestamp: Date.now(),
      workspaceId: msg.workspaceId || activeWs?.id || 'default',
    };
    set((state) => ({ messages: [...state.messages, newMsg] }));
    if (newMsg.role === 'user') {
      persistChatMessage(newMsg);
    }
    return id;
  },


  updateMessageContent: (
    id,
    content,
    isStreaming = false,
    recalled,
    proposed,
    tools,
    providerInfo
  ) => {
    set((state) => {
      const updatedMessages = state.messages.map((m) => {
        if (m.id !== id) return m;
        const updated: ChatMessage = {
          ...m,
          content,
          isStreaming,
          ...(recalled !== undefined ? { recalledMemories: recalled } : {}),
          ...(proposed !== undefined ? { proposedMemories: proposed } : {}),
          ...(tools !== undefined ? { toolExecutions: tools } : {}),
          ...(providerInfo !== undefined ? { providerInfo } : {}),
        };
        if (!isStreaming) {
          persistChatMessage(updated);
        }
        return updated;
      });
      return { messages: updatedMessages };
    });
  },

  setError: (error) => set({ error }),

  clearMessages: () => {
    const activeWs = useWorkspaceStore.getState().activeWorkspace;
    set({ messages: [], error: null, lastFailedPrompt: null });
    clearChatHistory(activeWs?.id).catch((err) =>
      console.warn('Failed to clear chat history in SQLite:', err)
    );
  },

  retryLastMessage: async () => {
    const prompt = get().lastFailedPrompt;
    if (!prompt) return;
    set({ error: null });
    await get().sendMessage(prompt);
  },

  confirmMemoryProposal: async (messageId: string, index: number) => {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg || !msg.proposedMemories || !msg.proposedMemories[index]) return;

    const proposal = msg.proposedMemories[index];
    try {
      const activeWs = useWorkspaceStore.getState().activeWorkspace;
      await addMemory(proposal.content, proposal.category, activeWs?.id);
      set((state) => {
        const updatedMessages = state.messages.map((m) => {
          if (m.id !== messageId || !m.proposedMemories) return m;
          const updated = [...m.proposedMemories];
          updated[index] = { ...updated[index], isSaved: true };
          const res = { ...m, proposedMemories: updated };
          persistChatMessage(res);
          return res;
        });
        return { messages: updatedMessages };
      });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  dismissMemoryProposal: (messageId: string, index: number) => {
    set((state) => {
      const updatedMessages = state.messages.map((m) => {
        if (m.id !== messageId || !m.proposedMemories) return m;
        const updated = m.proposedMemories.filter((_, i) => i !== index);
        const res = { ...m, proposedMemories: updated };
        persistChatMessage(res);
        return res;
      });
      return { messages: updatedMessages };
    });
  },

  approveToolExecution: async (messageId: string, index: number, alwaysAllow = false) => {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg || !msg.toolExecutions || !msg.toolExecutions[index]) return;

    const execution = msg.toolExecutions[index];

    // Transition to running state
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId || !m.toolExecutions) return m;
        const updated = [...m.toolExecutions];
        updated[index] = { ...updated[index], status: 'running' };
        return { ...m, toolExecutions: updated };
      }),
    }));

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
      if (
        alwaysAllow &&
        !execution.isDestructive &&
        execution.toolName === 'run_shell'
      ) {
        set((state) => ({
          alwaysAllowedCommands: [
            ...state.alwaysAllowedCommands,
            execution.args.command,
          ],
        }));
      }

      set((state) => {
        const updatedMessages = state.messages.map((m) => {
          if (m.id !== messageId || !m.toolExecutions) return m;
          const updated = [...m.toolExecutions];
          updated[index] = {
            ...updated[index],
            status: 'completed',
            result,
          };
          const res = { ...m, toolExecutions: updated };
          persistChatMessage(res);
          return res;
        });
        return { messages: updatedMessages };
      });
    } catch (err: unknown) {
      const errorStr = err instanceof Error ? err.message : String(err);
      set((state) => {
        const updatedMessages = state.messages.map((m) => {
          if (m.id !== messageId || !m.toolExecutions) return m;
          const updated = [...m.toolExecutions];
          updated[index] = {
            ...updated[index],
            status: 'error',
            error: errorStr,
          };
          const res = { ...m, toolExecutions: updated };
          persistChatMessage(res);
          return res;
        });
        return { messages: updatedMessages };
      });
    }
  },

  denyToolExecution: (messageId: string, index: number) => {
    set((state) => {
      const updatedMessages = state.messages.map((m) => {
        if (m.id !== messageId || !m.toolExecutions) return m;
        const updated = [...m.toolExecutions];
        updated[index] = { ...updated[index], status: 'denied' };
        const res = { ...m, toolExecutions: updated };
        persistChatMessage(res);
        return res;
      });
      return { messages: updatedMessages };
    });
  },

  sendMessage: async (userContent: string) => {
    const trimmed = userContent.trim();
    if (!trimmed || get().isLoading) return;

    set({ error: null, lastFailedPrompt: trimmed });

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


    // 4. Build system prompt with memories and tool specifications
    let systemPrompt =
      'You are Aeio, an intelligent, helpful, and concise local-first desktop AI assistant.';

    if (activeWs) {
      systemPrompt += `\nCurrent Workspace: "${activeWs.name}". Keep context focused on this workspace.`;
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

    // 5. Prepare conversation messages for provider
    const conversation: ProviderMessage[] = get().messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 6. Add assistant placeholder
    const assistantId = get().addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
      recalledMemories: recalled,
      providerInfo,
      workspaceId: wsId,
    });

    set({ isLoading: true });

    let rawStreamed = '';

    try {
      await chatWithActiveProvider(conversation, {
        systemPrompt,
        onChunk: (chunk) => {
          rawStreamed += chunk;
          // Clean partially-streamed XML tags for seamless user experience
          const cleanDisplay = rawStreamed
            .replace(/<remember[\s\S]*?(?:<\/remember>|$)/gi, '')
            .replace(/<tool_call[\s\S]*?(?:<\/tool_call>|$)/gi, '')
            .trim();
          get().updateMessageContent(
            assistantId,
            cleanDisplay,
            true,
            recalled,
            undefined,
            undefined,
            providerInfo
          );
        },
      });

      // 7. Parse any proposed memories from the full response
      const proposed: ProposedMemory[] = [];
      let memMatch: RegExpExecArray | null;
      while ((memMatch = REMEMBER_REGEX.exec(rawStreamed)) !== null) {
        const cat = memMatch[1].toLowerCase() as MemoryCategory;
        const memoryContent = memMatch[2].trim();
        if (memoryContent) {
          proposed.push({
            category: cat,
            content: memoryContent,
            isSaved: false,
          });
        }
      }

      // 8. Parse tool calls from the full response
      const tools: ToolExecution[] = [];
      let toolMatch: RegExpExecArray | null;
      while ((toolMatch = TOOL_CALL_REGEX.exec(rawStreamed)) !== null) {
        const toolName = toolMatch[1].trim();
        const rawArgsAttr = toolMatch[2] || toolMatch[3] || '';
        const rawArgsBody = toolMatch[4] || '';
        const argsStr = (rawArgsAttr || rawArgsBody || '{}').trim();

        let parsedArgs: Record<string, any> = {};
        try {
          parsedArgs = JSON.parse(argsStr);
        } catch {
          // If args string is a plain string, map based on tool name
          if (toolName === 'run_shell') parsedArgs = { command: argsStr };
          else if (toolName === 'read_file') parsedArgs = { path: argsStr };
          else if (toolName === 'write_clipboard') parsedArgs = { text: argsStr };
          else if (toolName === 'open_target') parsedArgs = { target: argsStr };
        }

        // Determine if command is destructive
        let isDestructive = false;
        if (toolName === 'run_shell' && parsedArgs.command) {
          try {
            isDestructive = await checkDestructiveCommand(parsedArgs.command);
          } catch {
            const lower = parsedArgs.command.toLowerCase();
            isDestructive = ['rm ', 'del ', 'format ', 'dd ', 'rmdir'].some((p) =>
              lower.includes(p)
            );
          }
        }

        tools.push({
          id: crypto.randomUUID(),
          toolName,
          args: parsedArgs,
          status: 'pending_approval',
          isDestructive,
        });
      }

      // Final clean text without raw XML tags
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
        providerInfo
      );

      // 9. Auto-execute any non-destructive tools that are already marked "always allow"
      if (tools.length > 0) {
        for (let i = 0; i < tools.length; i++) {
          const t = tools[i];
          if (
            t.toolName === 'run_shell' &&
            !t.isDestructive &&
            get().alwaysAllowedCommands.includes(t.args.command)
          ) {
            get().approveToolExecution(assistantId, i);
          }
        }
      }

      // Success: clear last failed prompt
      set({ lastFailedPrompt: null });
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Failed to receive response from provider.';

      // Actionable error mapping for Graceful Degradation (Tier 3)
      let actionableError = errorMsg;
      if (
        errorMsg.includes('Failed to fetch') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('11434')
      ) {
        actionableError =
          'Ollama is offline or unreachable on localhost:11434. Make sure Ollama is running (`ollama serve`).';
      }

      if (!rawStreamed) {
        get().updateMessageContent(
          assistantId,
          `⚠️ **Connection Issue**: ${actionableError}`,
          false,
          recalled,
          undefined,
          undefined,
          providerInfo
        );
      }
      set({ error: actionableError, lastFailedPrompt: trimmed });
    } finally {
      set({ isLoading: false });
    }
  },
}));

