import { create } from 'zustand';
import { chatWithActiveProvider, ProviderMessage } from '../lib/providers';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessageContent: (id: string, content: string, isStreaming?: boolean) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  sendMessage: (userContent: string) => Promise<void>;
}

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

  updateMessageContent: (id, content, isStreaming = false) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content, isStreaming } : m
      ),
    }));
  },

  setError: (error) => set({ error }),

  clearMessages: () => set({ messages: [], error: null }),

  sendMessage: async (userContent: string) => {
    const trimmed = userContent.trim();
    if (!trimmed || get().isLoading) return;

    set({ error: null });

    // 1. Add user message
    get().addMessage({
      role: 'user',
      content: trimmed,
    });

    // 2. Prepare conversation messages for provider
    const conversation: ProviderMessage[] = get().messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 3. Add assistant placeholder
    const assistantId = get().addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
    });

    set({ isLoading: true });

    let accumulatedContent = '';

    try {
      await chatWithActiveProvider(conversation, {
        onChunk: (chunk) => {
          accumulatedContent += chunk;
          get().updateMessageContent(assistantId, accumulatedContent, true);
        },
      });

      // Mark as finished streaming
      get().updateMessageContent(assistantId, accumulatedContent, false);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Failed to receive response from provider.';
      
      // If nothing streamed, show error in message
      if (!accumulatedContent) {
        get().updateMessageContent(
          assistantId,
          `⚠️ **Error**: ${errorMsg}`,
          false
        );
      }
      set({ error: errorMsg });
    } finally {
      set({ isLoading: false });
    }
  },
}));
