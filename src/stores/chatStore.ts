import { create } from 'zustand';
import { chatWithActiveProvider, ProviderMessage } from '../lib/providers';
import { addMemory, MemoryCategory, searchMemories } from '../lib/ipc';

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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  recalledMemories?: RecalledMemory[];
  proposedMemories?: ProposedMemory[];
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessageContent: (
    id: string,
    content: string,
    isStreaming?: boolean,
    recalled?: RecalledMemory[],
    proposed?: ProposedMemory[]
  ) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  sendMessage: (userContent: string) => Promise<void>;
  confirmMemoryProposal: (messageId: string, index: number) => Promise<void>;
  dismissMemoryProposal: (messageId: string, index: number) => void;
}

const REMEMBER_REGEX = /<remember\s+category=["']?(fact|preference|project|person)["']?>([\s\S]*?)<\/remember>/gi;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,

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

  updateMessageContent: (id, content, isStreaming = false, recalled, proposed) => {
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== id) return m;
        return {
          ...m,
          content,
          isStreaming,
          ...(recalled ? { recalledMemories: recalled } : {}),
          ...(proposed ? { proposedMemories: proposed } : {}),
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

    // 3. Build system prompt with memories
    let systemPrompt =
      'You are Aeio, an intelligent, helpful, and concise local-first desktop AI assistant.';

    if (recalled.length > 0) {
      systemPrompt +=
        '\n\nRelevant user memories from the local memory store:\n' +
        recalled.map((m) => `- [${m.category}] ${m.content}`).join('\n');
    }

    systemPrompt +=
      '\n\nIf the user shares an enduring personal fact, preference, project detail, or contact, propose remembering it using: <remember category="fact|preference|project|person">The concise memory text</remember>. Only remember genuine facts, not transient statements.';

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
          // Clean any partially-typed remember tags for smooth live reading
          const cleanDisplay = rawStreamed.replace(
            /<remember[\s\S]*?(?:<\/remember>|$)/gi,
            ''
          );
          get().updateMessageContent(assistantId, cleanDisplay, true, recalled);
        },
      });

      // 6. Parse any proposed memories from the full response
      const proposed: ProposedMemory[] = [];
      let match: RegExpExecArray | null;
      while ((match = REMEMBER_REGEX.exec(rawStreamed)) !== null) {
        const cat = match[1].toLowerCase() as MemoryCategory;
        const memoryContent = match[2].trim();
        if (memoryContent) {
          proposed.push({
            category: cat,
            content: memoryContent,
            isSaved: false,
          });
        }
      }

      // Final clean text without raw XML tags
      const finalText = rawStreamed.replace(REMEMBER_REGEX, '').trim();

      get().updateMessageContent(
        assistantId,
        finalText || rawStreamed,
        false,
        recalled,
        proposed
      );
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
