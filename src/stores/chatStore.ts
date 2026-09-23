import { create } from 'zustand';
import { chatWithActiveProvider, ProviderMessage } from '../lib/providers';
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  recalledMemories?: RecalledMemory[];
  proposedMemories?: ProposedMemory[];
  toolExecutions?: ToolExecution[];
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  alwaysAllowedCommands: string[];
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessageContent: (
    id: string,
    content: string,
    isStreaming?: boolean,
    recalled?: RecalledMemory[],
    proposed?: ProposedMemory[],
    tools?: ToolExecution[]
  ) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  sendMessage: (userContent: string) => Promise<void>;
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

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,
  alwaysAllowedCommands: [],

  addMessage: (msg) => {
    const id = crypto.randomUUID();
    const newMsg: ChatMessage = {
      ...msg,
      id,
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, newMsg] }));
    return id;
  },

  updateMessageContent: (id, content, isStreaming = false, recalled, proposed, tools) => {
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== id) return m;
        return {
          ...m,
          content,
          isStreaming,
          ...(recalled ? { recalledMemories: recalled } : {}),
          ...(proposed ? { proposedMemories: proposed } : {}),
          ...(tools ? { toolExecutions: tools } : {}),
        };
      }),
    }));
  },

  setError: (error) => set({ error }),

  clearMessages: () => set({ messages: [], error: null }),

  confirmMemoryProposal: async (messageId: string, index: number) => {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg || !msg.proposedMemories || !msg.proposedMemories[index]) return;

    const proposal = msg.proposedMemories[index];
    try {
      await addMemory(proposal.content, proposal.category);
      set((state) => ({
        messages: state.messages.map((m) => {
          if (m.id !== messageId || !m.proposedMemories) return m;
          const updated = [...m.proposedMemories];
          updated[index] = { ...updated[index], isSaved: true };
          return { ...m, proposedMemories: updated };
        }),
      }));
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  dismissMemoryProposal: (messageId: string, index: number) => {
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId || !m.proposedMemories) return m;
        const updated = m.proposedMemories.filter((_, i) => i !== index);
        return { ...m, proposedMemories: updated };
      }),
    }));
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

      set((state) => ({
        messages: state.messages.map((m) => {
          if (m.id !== messageId || !m.toolExecutions) return m;
          const updated = [...m.toolExecutions];
          updated[index] = {
            ...updated[index],
            status: 'completed',
            result,
          };
          return { ...m, toolExecutions: updated };
        }),
      }));
    } catch (err: unknown) {
      const errorStr = err instanceof Error ? err.message : String(err);
      set((state) => ({
        messages: state.messages.map((m) => {
          if (m.id !== messageId || !m.toolExecutions) return m;
          const updated = [...m.toolExecutions];
          updated[index] = {
            ...updated[index],
            status: 'error',
            error: errorStr,
          };
          return { ...m, toolExecutions: updated };
        }),
      }));
    }
  },

  denyToolExecution: (messageId: string, index: number) => {
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId || !m.toolExecutions) return m;
        const updated = [...m.toolExecutions];
        updated[index] = { ...updated[index], status: 'denied' };
        return { ...m, toolExecutions: updated };
      }),
    }));
  },

  sendMessage: async (userContent: string) => {
    const trimmed = userContent.trim();
    if (!trimmed || get().isLoading) return;

    set({ error: null });

    // 1. Add user message
    get().addMessage({
      role: 'user',
      content: trimmed,
    });

    // 2. Search relevant memories to inject as context (Transparent Recall)
    let recalled: RecalledMemory[] = [];
    try {
      const searchResults = await searchMemories(trimmed, 4);
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

    // 3. Build system prompt with memories and tool specifications
    let systemPrompt =
      'You are Aeio, an intelligent, helpful, and concise local-first desktop AI assistant.';

    if (recalled.length > 0) {
      systemPrompt +=
        '\n\nRelevant user memories from the local memory store:\n' +
        recalled.map((m) => `- [${m.category}] ${m.content}`).join('\n');
    }

    systemPrompt +=
      '\n\nIf the user shares an enduring personal fact, preference, project detail, or contact, propose remembering it using: <remember category="fact|preference|project|person">The concise memory text</remember>. Only remember genuine facts, not transient statements.';

    systemPrompt +=
      '\n\nYou have access to local host tools. When the user requests host actions (reading files, searching files, inspecting or writing clipboard, or running shell commands), output the corresponding XML tool call tag:' +
      '\n- Run shell: <tool_call name="run_shell" args=\'{"command":"..."}\'></tool_call>' +
      '\n- Read file: <tool_call name="read_file" args=\'{"path":"..."}\'></tool_call>' +
      '\n- Search directory: <tool_call name="search_files" args=\'{"dir":".","query":"..."}\'></tool_call>' +
      '\n- Read clipboard: <tool_call name="read_clipboard" args=\'{}\'></tool_call>' +
      '\n- Write clipboard: <tool_call name="write_clipboard" args=\'{"text":"..."}\'></tool_call>' +
      '\nAlways explain what you are doing in plain text alongside the tool call.';

    // 4. Prepare conversation messages for provider
    const conversation: ProviderMessage[] = get().messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 5. Add assistant placeholder
    const assistantId = get().addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
      recalledMemories: recalled,
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
          get().updateMessageContent(assistantId, cleanDisplay, true, recalled);
        },
      });

      // 6. Parse any proposed memories from the full response
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

      // 7. Parse tool calls from the full response
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
        tools
      );

      // 8. Auto-execute any non-destructive tools that are already marked "always allow"
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
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Failed to receive response from provider.';

      if (!rawStreamed) {
        get().updateMessageContent(
          assistantId,
          `⚠️ **Error**: ${errorMsg}`,
          false,
          recalled
        );
      }
      set({ error: errorMsg });
    } finally {
      set({ isLoading: false });
    }
  },
}));
