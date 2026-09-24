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
  reasoning?: string;
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
  consecutiveAgenticRounds: number;
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
    activeWindowContext?: ActiveWindowInfo,
    reasoning?: string
  ) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  sendMessage: (
    userContent: string,
    options?: { isAgenticContinuation?: boolean; role?: 'user' | 'system' }
  ) => Promise<void>;
  continueAgenticTurn: (
    assistantMessageId: string,
    completedTool: ToolExecution
  ) => Promise<void>;
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

export const REMEMBER_REGEX =
  /<remember\s+category=["']?(fact|preference|project|person)["']?>([\s\S]*?)<\/remember>/gi;

export const THINK_REGEX = /<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/gi;
export const UNCLOSED_THINK_REGEX = /<(?:think|thought)>([\s\S]*?)$/i;

export const XML_TOOL_CALL_REGEX =
  /<tool_call\s+name=["']?([^"'\s>]+)["']?(?:\s+args=(?:'([^']*)'|"([^"]*)"))?\s*(?:\/>|>([\s\S]*?)<\/tool_call>)/gi;

export const JSON_TOOL_CALL_REGEX =
  /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/gi;

function persistChatMessage(msg: ChatMessage) {
  const activeWs = useWorkspaceStore.getState().activeWorkspace;
  const wsId = msg.workspaceId || activeWs?.id || 'default';

  // Embed reasoning into provider_info_json for seamless backwards-compatible persistence
  const serializedProviderInfo = msg.providerInfo
    ? JSON.stringify({ ...msg.providerInfo, reasoning: msg.reasoning })
    : msg.reasoning
    ? JSON.stringify({ reasoning: msg.reasoning })
    : null;

  saveChatMessage({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    recalled_memories_json: msg.recalledMemories ? JSON.stringify(msg.recalledMemories) : null,
    proposed_memories_json: msg.proposedMemories ? JSON.stringify(msg.proposedMemories) : null,
    tool_executions_json: msg.toolExecutions ? JSON.stringify(msg.toolExecutions) : null,
    provider_info_json: serializedProviderInfo,
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
  consecutiveAgenticRounds: 0,

  initChatHistory: async (workspaceId?: string) => {
    try {
      const activeWs = useWorkspaceStore.getState().activeWorkspace;
      const wsId = workspaceId || activeWs?.id || 'default';
      const saved = await loadChatMessages(wsId, 100);
      if (saved) {
        const parsed: ChatMessage[] = saved.map((s) => {
          let parsedProvider: ProviderBadgeInfo | undefined = undefined;
          let parsedReasoning: string | undefined = undefined;
          if (s.provider_info_json) {
            try {
              const meta = JSON.parse(s.provider_info_json);
              parsedReasoning = meta.reasoning;
              if (meta.providerId) {
                parsedProvider = meta;
              }
            } catch {}
          }

          return {
            id: s.id,
            role: s.role as 'user' | 'assistant' | 'system',
            content: s.content,
            timestamp: s.timestamp,
            reasoning: parsedReasoning,
            recalledMemories: s.recalled_memories_json
              ? JSON.parse(s.recalled_memories_json)
              : undefined,
            proposedMemories: s.proposed_memories_json
              ? JSON.parse(s.proposed_memories_json)
              : undefined,
            toolExecutions: s.tool_executions_json
              ? JSON.parse(s.tool_executions_json)
              : undefined,
            providerInfo: parsedProvider,
            workspaceId: s.workspace_id || undefined,
          };
        });
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
    activeWindowContext,
    reasoning
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
            reasoning: reasoning !== undefined ? reasoning : m.reasoning,
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
    useSettingsStore.getState().setActiveProvider('qwen-coder');
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
      message.activeWindowContext,
      message.reasoning
    );
  },

  continueAgenticTurn: async (_assistantMessageId: string, completedTool: ToolExecution) => {
    const currentRounds = get().consecutiveAgenticRounds;
    if (currentRounds >= 4) {
      // Safe bound to prevent unbounded autonomous recursion
      set({ consecutiveAgenticRounds: 0 });
      return;
    }

    set({ consecutiveAgenticRounds: currentRounds + 1 });

    const statusHeader =
      completedTool.status === 'completed'
        ? `[Tool Result: ${completedTool.toolName}]`
        : `[Tool Error: ${completedTool.toolName}]`;

    const formattedPayload =
      completedTool.result !== undefined
        ? typeof completedTool.result === 'object'
          ? JSON.stringify(completedTool.result, null, 2)
          : String(completedTool.result)
        : completedTool.error || 'Execution finished without output.';

    const continuationPrompt = `${statusHeader}\n\`\`\`\n${formattedPayload}\n\`\`\`\n\nAnalyze this output, continue your reasoning, and complete the user task.`;

    await get().sendMessage(continuationPrompt, { isAgenticContinuation: true, role: 'user' });
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
      message.activeWindowContext,
      message.reasoning
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
      const messageAfter = get().messages.find((m) => m.id === messageId);
      if (!messageAfter || !messageAfter.toolExecutions) return;
      const completedTools = [...messageAfter.toolExecutions];
      completedTools[index] = {
        ...execution,
        status: 'completed',
        result,
      };

      get().updateMessageContent(
        messageId,
        messageAfter.content,
        messageAfter.isStreaming,
        messageAfter.recalledMemories,
        messageAfter.proposedMemories,
        completedTools,
        messageAfter.providerInfo,
        messageAfter.activeWindowContext,
        messageAfter.reasoning
      );

      // Autonomous agentic continuation: feed completed tool output back to Qwen3-Coder
      await get().continueAgenticTurn(messageId, completedTools[index]);
    } catch (err: unknown) {
      const errorStr = err instanceof Error ? err.message : String(err);
      const messageAfter = get().messages.find((m) => m.id === messageId);
      if (!messageAfter || !messageAfter.toolExecutions) return;
      const errorTools = [...messageAfter.toolExecutions];
      errorTools[index] = {
        ...execution,
        status: 'error',
        error: errorStr,
      };

      get().updateMessageContent(
        messageId,
        messageAfter.content,
        messageAfter.isStreaming,
        messageAfter.recalledMemories,
        messageAfter.proposedMemories,
        errorTools,
        messageAfter.providerInfo,
        messageAfter.activeWindowContext,
        messageAfter.reasoning
      );

      // Feed error back so agent can diagnose and provide recovery steps
      await get().continueAgenticTurn(messageId, errorTools[index]);
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
      message.activeWindowContext,
      message.reasoning
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

  sendMessage: async (
    userContent: string,
    options?: { isAgenticContinuation?: boolean; role?: 'user' | 'system' }
  ) => {
    const trimmed = userContent.trim();
    if (!trimmed || get().isLoading) return;

    if (!options?.isAgenticContinuation) {
      set({ consecutiveAgenticRounds: 0 });
    }

    set({ error: null, lastFailedPrompt: trimmed, activeNudge: null });

    const activeWs = useWorkspaceStore.getState().activeWorkspace;
    const wsId = activeWs?.id || 'default';

    // 1. Add message (user or automated agentic context)
    get().addMessage({
      role: options?.role || 'user',
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
      providerId === 'qwen-coder'
        ? settings.ollamaModel || 'qwen3-coder'
        : providerId === 'ollama'
        ? settings.ollamaModel || 'llama3.2'
        : providerId === 'claude'
        ? 'claude-3-5-sonnet'
        : 'gpt-4o';
    const isLocal = providerId === 'qwen-coder' || providerId === 'ollama';
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

    // 5. Build system prompt tailored for Qwen3-Coder
    let systemPrompt =
      'You are Aeio, an intelligent, helpful, and concise local-first desktop AI assistant powered by Qwen3-Coder.\n' +
      'You specialize in programming, systems automation, shell scripting, code analysis, and local host tasks.\n' +
      'Always adhere to these guidelines:\n' +
      '1. Be direct, precise, and concise. Never use emojis or conversational fluff.\n' +
      '2. For non-trivial code analysis, logic, or multi-step decisions, output your internal reasoning inside <think>Your thought process</think> before your final response.\n' +
      '3. You have access to local host tools. When host actions are needed, output tool calls using either format:\n' +
      '   <tool_call name="tool_name" args=\'{"param":"val"}\'></tool_call> or\n' +
      '   <tool_call>{"name": "tool_name", "arguments": {"param":"val"}}</tool_call>\n' +
      '4. Available host tools:\n' +
      '   - run_shell: Execute shell commands. Arguments: {"command": "...", "cwd": "optional_path"}\n' +
      '   - read_file: Read file contents. Arguments: {"path": "..."}\n' +
      '   - search_files: Search directory for files matching query. Arguments: {"dir": ".", "query": "..."}\n' +
      '   - open_target: Open file, directory, application, or URL with default OS handler. Arguments: {"target": "..."}\n' +
      '   - read_clipboard: Inspect clipboard text. Arguments: {}\n' +
      '   - write_clipboard: Copy text to clipboard. Arguments: {"text": "..."}\n' +
      '5. When tool execution outputs are fed back to you, analyze the result and deliver the synthesized answer or next action.';

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

          // Check if streaming is currently inside open thinking tags
          let streamReasoning: string | undefined = undefined;
          const openThink = UNCLOSED_THINK_REGEX.exec(rawStreamed);
          if (openThink && openThink[1]) {
            streamReasoning = openThink[1].trim();
          } else {
            const closedMatches = [...rawStreamed.matchAll(new RegExp(THINK_REGEX.source, 'gi'))];
            if (closedMatches.length > 0) {
              streamReasoning = closedMatches.map((m) => m[1].trim()).join('\n\n');
            }
          }

          const cleanDisplay = rawStreamed
            .replace(THINK_REGEX, '')
            .replace(UNCLOSED_THINK_REGEX, '')
            .replace(REMEMBER_REGEX, '')
            .replace(XML_TOOL_CALL_REGEX, '')
            .replace(JSON_TOOL_CALL_REGEX, '')
            .trim();

          get().updateMessageContent(
            assistantId,
            cleanDisplay || (streamReasoning ? 'Thinking...' : '...'),
            true,
            recalled,
            undefined,
            undefined,
            providerInfo,
            activeWinInfo,
            streamReasoning
          );
        },
      });

      // 8. Parse completed reasoning
      let finalReasoning: string | undefined = undefined;
      const thinkMatches = [...rawStreamed.matchAll(new RegExp(THINK_REGEX.source, 'gi'))];
      if (thinkMatches.length > 0) {
        finalReasoning = thinkMatches.map((m) => m[1].trim()).filter(Boolean).join('\n\n');
      }

      // 9. Parse completed response for memory proposals
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

      // 10. Parse completed response for tool execution requests (both XML and JSON formats)
      const tools: ToolExecution[] = [];
      const handledToolSignatures = new Set<string>();

      // A. XML format: <tool_call name="..." args='...'> or <tool_call name="...">...</tool_call>
      let xmlMatch;
      const xmlRegex = new RegExp(XML_TOOL_CALL_REGEX.source, 'gi');
      while ((xmlMatch = xmlRegex.exec(rawStreamed)) !== null) {
        handledToolSignatures.add(xmlMatch[0]);
        const name = xmlMatch[1].trim();
        const argsStr = xmlMatch[2] || xmlMatch[3] || xmlMatch[4] || '{}';
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

      // B. JSON payload format inside <tool_call>...</tool_call> (standard Qwen-Coder format)
      let jsonMatch;
      const jsonRegex = new RegExp(JSON_TOOL_CALL_REGEX.source, 'gi');
      while ((jsonMatch = jsonRegex.exec(rawStreamed)) !== null) {
        if (handledToolSignatures.has(jsonMatch[0])) continue;
        const inner = jsonMatch[1].trim();
        try {
          const parsed = JSON.parse(inner);
          if (parsed.name) {
            const name = String(parsed.name).trim();
            const args = (parsed.arguments || parsed.parameters || parsed.args || {}) as Record<string, any>;
            let isDestructive = false;
            if (name === 'run_shell' && args.command) {
              try {
                isDestructive = await checkDestructiveCommand(args.command);
              } catch {
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
        } catch {
          // not json, ignored
        }
      }

      const finalText = rawStreamed
        .replace(THINK_REGEX, '')
        .replace(REMEMBER_REGEX, '')
        .replace(XML_TOOL_CALL_REGEX, '')
        .replace(JSON_TOOL_CALL_REGEX, '')
        .trim();

      get().updateMessageContent(
        assistantId,
        finalText || rawStreamed,
        false,
        recalled,
        proposed,
        tools,
        providerInfo,
        activeWinInfo,
        finalReasoning
      );

      // 11. Auto-execute any non-destructive tools that are already marked "always allow"
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
        if (providerInfo.providerId === 'qwen-coder' || providerInfo.providerId === 'ollama') {
          actionableError =
            'Local AI inference engine (Ollama) is offline or unreachable on localhost:11434. Make sure Ollama is running (`ollama serve`).';
        } else {
          actionableError = `Network connection offline while connecting to ${providerInfo.providerId.toUpperCase()}. You can switch to local Qwen3-Coder.`;
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
