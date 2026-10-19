import { create } from 'zustand';
import { orchestrateChat, ProviderMessage, TaskType, ModelRouteTier } from '../lib/providers';
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
  writeFile,
  fetchUrl,
  judgeCommandRisk,
  classifyUserTask,
  rerankMemories,
  SystemOneTaskIntentVerdict,
  setSystemVolume,
  getSystemVolume,
  setSystemMute,
  playSpotify,
  mediaControl,
  searchWebPlatform,
  lockScreen,
  simulateKeyPress,
  simulateScroll,
  openApp,
  injectTextToActiveApp,
  captureScreenData,
  playSystemEarcon,
  showMainWindow,
  manageActiveWindow,
  searchLocalFiles,
  getPowerStatus,
} from '../lib/ipc';
import { inspectActiveScreen } from '../lib/vision/screenInspector';
import { evaluateMath, solveEquation, solveSystem } from '../lib/agent/tools/mathTool';
import { browsePage, extractPageLinks } from '../lib/agent/tools/browserTool';
import { speakJARVISFeedback } from '../lib/voice/voiceEngine';
import { executeAgentTool } from '../lib/agent/toolRegistry';
import {
  ExecutionPlan,
  parsePlanFromResponse,
  classifyPlanSafety,
  isGuiActionDestructive,
  normalizeToolName,
  cleanDisplayContent,
} from '../lib/agent/plan';
import { rerankMemoriesSystemOne } from '../lib/systemOne/memoryRerank';
import { matchInstantAction } from '../lib/systemOne/instantActions';
import { isHaltActive } from '../lib/safety/killSwitch';
import { isHardBlocked } from '../lib/safety/allowlist';
import { requireActionApproval } from '../lib/safety/approvalGate';
import { showControlOverlay, hideControlOverlay } from '../lib/safety/overlay';
import { executeActionWithVisualAudit } from '../lib/safety/auditLog';
import { ComputerAction, SimulatedActionRequest } from '../lib/safety/inputDriver';
import { ActionIntent } from '../lib/types/actionIntent';
import { resolveGroundingTarget } from '../lib/safety/groundingClient';
import { searchSearxng } from '../lib/agent/tools/searxngSearch';

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
  riskTier?: 'low' | 'medium' | 'critical';
  destructiveProbability?: number;
  safetyRationale?: string;
  result?: any;
  error?: string;
}

export interface ProviderBadgeInfo {
  providerId: string;
  modelName: string;
  isLocal: boolean;
  isPrivacyProtected?: boolean;
  memoriesWithheld?: number;
  recommendedRoute?: 'local_first' | 'cloud_boost';
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
  plan?: ExecutionPlan;
  screenSnapshot?: {
    base64: string;
    width: number;
    height: number;
    filePath?: string;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  workspaceId?: string;
}

export interface ChatState {
  messages: ChatMessage[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoading: boolean;
  error: string | null;
  lastFailedPrompt: string | null;
  alwaysAllowedCommands: string[];
  activeNudge: ProactiveNudge | null;
  dismissedNudgeIds: string[];
  consecutiveAgenticRounds: number;
  activeRunningPlanMessageId: string | null;
  initChatHistory: (workspaceId?: string) => Promise<void>;
  createNewSession: (workspaceId?: string) => string;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newTitle: string) => void;
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
    reasoning?: string,
    plan?: ExecutionPlan
  ) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  sendMessage: (
    userContent: string,
    options?: { isAgenticContinuation?: boolean; role?: 'user' | 'system'; autoApproveSafeTools?: boolean }
  ) => Promise<void>;
  inspectCurrentScreen: (customPrompt?: string) => Promise<void>;
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
  approvePlan: (messageId: string) => Promise<void>;
  cancelPlan: (messageId: string) => void;
  executePlan: (messageId: string) => Promise<void>;
  dismissNudge: (id: string) => void;
  applyNudge: (nudge: ProactiveNudge) => Promise<void>;
  checkForAmbientNudge: () => Promise<void>;
}

export const REMEMBER_REGEX =
  /<remember\s+category=["']?(fact|preference|project|person)["']?>([\s\S]*?)<\/remember>/gi;

export const THINK_REGEX = /<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/gi;
export const UNCLOSED_THINK_REGEX = /<(?:think|thought)>([\s\S]*?)$/i;

export const XML_TOOL_CALL_REGEX =
  /(?:```(?:xml|json)?\s*)?<tool_call(?:\s+name=["']?([^"'\s>]+)["']?)?(?:\s+args=(?:'([^']*)'|"([^"]*)"))?\s*(?:\/>|>([\s\S]*?)<\/tool_call>|>|$)(?:\s*```)?/gi;

export const JSON_TOOL_CALL_REGEX =
  /(?:```json\s*)?<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>(?:\s*```)?/gi;

/**
 * Micro-throttled streaming buffer for high-frequency token updates.
 * Caps React state and Markdown parser updates to ~33fps (30ms interval)
 * during fast local/remote token generation, eliminating UI micro-stutters.
 */
class StreamingThrottle {
  private lastUpdate = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: (() => void) | null = null;
  private intervalMs: number;

  constructor(intervalMs = 30) {
    this.intervalMs = intervalMs;
  }

  schedule(fn: () => void) {
    this.pending = fn;
    const now = performance.now();
    const elapsed = now - this.lastUpdate;

    if (elapsed >= this.intervalMs) {
      this.flush();
    } else if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.intervalMs - elapsed);
    }
  }

  flush() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending) {
      const fn = this.pending;
      this.pending = null;
      this.lastUpdate = performance.now();
      fn();
    }
  }
}

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

const SESSIONS_STORAGE_KEY = 'aeio_chat_sessions_v2';
const ACTIVE_SESSION_STORAGE_KEY = 'aeio_active_session_id';

export function deriveSessionTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.content && m.content.trim().length > 0);
  if (!firstUser) return 'New chat';
  const clean = firstUser.content.replace(/[\r\n]+/g, ' ').trim();
  return clean.length > 36 ? `${clean.slice(0, 36)}...` : clean;
}

function sanitizeSessionForStorage(session: ChatSession): ChatSession {
  return {
    ...session,
    messages: session.messages.map((m) => {
      if (m.screenSnapshot && m.screenSnapshot.base64 && m.screenSnapshot.base64.length > 500) {
        return {
          ...m,
          screenSnapshot: {
            ...m.screenSnapshot,
            base64: '',
          },
        };
      }
      return m;
    }),
  };
}

function loadStoredSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredSessions(sessions: ChatSession[], activeId?: string | null) {
  try {
    const sanitized = sessions.map(sanitizeSessionForStorage);
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sanitized));
    if (activeId) {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeId);
    }
  } catch (err) {
    console.warn('Failed to save chat sessions to localStorage:', err);
  }
}

function parseSqliteMessages(saved: any[]): ChatMessage[] {
  return saved.map((s) => {
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
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessions: [],
  activeSessionId: null,
  isLoading: false,
  error: null,
  lastFailedPrompt: null,
  alwaysAllowedCommands: [],
  activeNudge: null,
  dismissedNudgeIds: [],
  consecutiveAgenticRounds: 0,
  activeRunningPlanMessageId: null,

  initChatHistory: async (workspaceId?: string) => {
    try {
      const activeWs = useWorkspaceStore.getState().activeWorkspace;
      const wsId = workspaceId || activeWs?.id || 'default';

      let sessions = loadStoredSessions();
      let activeSessionId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);

      // If no sessions in localStorage yet, check SQLite for existing messages to seed initial session
      if (sessions.length === 0) {
        const saved = await loadChatMessages(wsId, 100);
        if (saved && saved.length > 0) {
          const parsed = parseSqliteMessages(saved);
          const initialSession: ChatSession = {
            id: crypto.randomUUID(),
            title: deriveSessionTitle(parsed),
            messages: parsed,
            createdAt: parsed[0]?.timestamp || Date.now(),
            updatedAt: parsed[parsed.length - 1]?.timestamp || Date.now(),
            workspaceId: wsId,
          };
          sessions = [initialSession];
          activeSessionId = initialSession.id;
          saveStoredSessions(sessions, activeSessionId);
        } else {
          const initialSession: ChatSession = {
            id: crypto.randomUUID(),
            title: 'New chat',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            workspaceId: wsId,
          };
          sessions = [initialSession];
          activeSessionId = initialSession.id;
          saveStoredSessions(sessions, activeSessionId);
        }
      }

      let currentSession = sessions.find((s) => s.id === activeSessionId);
      if (!currentSession) {
        currentSession = sessions[0];
        activeSessionId = currentSession ? currentSession.id : null;
      }

      set({
        sessions,
        activeSessionId,
        messages: currentSession ? currentSession.messages : [],
      });
    } catch (err) {
      console.warn('Failed to load chat history from storage/SQLite:', err);
    }
  },

  createNewSession: (workspaceId?: string) => {
    const activeWs = useWorkspaceStore.getState().activeWorkspace;
    const wsId = workspaceId || activeWs?.id || 'default';
    const state = get();

    // If active session already has no messages, simply focus it
    const active = state.sessions.find((s) => s.id === state.activeSessionId);
    if (active && active.messages.length === 0) {
      set({ messages: [], activeNudge: null, error: null });
      return active.id;
    }

    // Prune any empty abandoned sessions before creating a new one
    const cleanSessions = state.sessions.filter((s) => s.messages.length > 0);

    const newId = crypto.randomUUID();
    const newSession: ChatSession = {
      id: newId,
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspaceId: wsId,
    };

    const updatedSessions = [newSession, ...cleanSessions];
    saveStoredSessions(updatedSessions, newId);

    set({
      sessions: updatedSessions,
      activeSessionId: newId,
      messages: [],
      activeNudge: null,
      error: null,
    });

    return newId;
  },

  switchSession: (sessionId: string) => {
    const state = get();
    const target = state.sessions.find((s) => s.id === sessionId);
    if (!target) return;

    // Prune empty inactive sessions when navigating to another session
    const prunedSessions = state.sessions.filter(
      (s) => s.id === sessionId || s.messages.length > 0
    );

    saveStoredSessions(prunedSessions, sessionId);
    set({
      sessions: prunedSessions,
      activeSessionId: sessionId,
      messages: target.messages,
      activeNudge: null,
      error: null,
    });
  },

  deleteSession: (sessionId: string) => {
    const state = get();
    const remaining = state.sessions.filter((s) => s.id !== sessionId);

    let nextActiveId = state.activeSessionId;
    let nextMessages = state.messages;

    if (state.activeSessionId === sessionId) {
      if (remaining.length > 0) {
        nextActiveId = remaining[0].id;
        nextMessages = remaining[0].messages;
      } else {
        const activeWs = useWorkspaceStore.getState().activeWorkspace;
        const freshId = crypto.randomUUID();
        const freshSession: ChatSession = {
          id: freshId,
          title: 'New chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          workspaceId: activeWs?.id || 'default',
        };
        remaining.push(freshSession);
        nextActiveId = freshId;
        nextMessages = [];
      }
    }

    saveStoredSessions(remaining, nextActiveId);

    set({
      sessions: remaining,
      activeSessionId: nextActiveId,
      messages: nextMessages,
    });
  },

  renameSession: (sessionId: string, newTitle: string) => {
    const state = get();
    const cleanTitle = newTitle.trim() || 'Untitled chat';
    const updated = state.sessions.map((s) =>
      s.id === sessionId ? { ...s, title: cleanTitle, updatedAt: Date.now() } : s
    );
    saveStoredSessions(updated, state.activeSessionId);
    set({ sessions: updated });
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

    set((state) => {
      const newMessages = [...state.messages, newMessage];
      let activeId = state.activeSessionId;
      let sessions = [...state.sessions];

      if (!activeId || !sessions.some((s) => s.id === activeId)) {
        activeId = crypto.randomUUID();
        const newSession: ChatSession = {
          id: activeId,
          title: deriveSessionTitle(newMessages),
          messages: newMessages,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          workspaceId: wsId,
        };
        sessions.unshift(newSession);
      } else {
        sessions = sessions.map((s) => {
          if (s.id === activeId) {
            const shouldRename =
              s.title === 'New chat' ||
              s.title === 'Current conversation' ||
              s.messages.length === 0;
            return {
              ...s,
              title: shouldRename ? deriveSessionTitle(newMessages) : s.title,
              messages: newMessages,
              updatedAt: Date.now(),
            };
          }
          return s;
        });
        // Sort sessions with most recently active first
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      }

      saveStoredSessions(sessions, activeId);

      return {
        messages: newMessages,
        sessions,
        activeSessionId: activeId,
      };
    });

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
    reasoning,
    plan
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
            plan: plan !== undefined ? plan : m.plan,
          };
          if (!isStreaming) {
            persistChatMessage(updated);
          }
          return updated;
        }
        return m;
      });

      let sessions = state.sessions;
      if (state.activeSessionId) {
        sessions = state.sessions.map((s) => {
          if (s.id === state.activeSessionId) {
            const shouldRename =
              (s.title === 'New chat' || s.title === 'Current conversation') &&
              updatedMessages.some((msg) => msg.role === 'user');
            return {
              ...s,
              title: shouldRename ? deriveSessionTitle(updatedMessages) : s.title,
              messages: updatedMessages,
              updatedAt: Date.now(),
            };
          }
          return s;
        });
        if (!isStreaming) {
          saveStoredSessions(sessions, state.activeSessionId);
        }
      }

      return { messages: updatedMessages, sessions };
    });
  },

  setError: (error) => set({ error }),

  clearMessages: async () => {
    const activeWs = useWorkspaceStore.getState().activeWorkspace;
    const wsId = activeWs?.id || 'default';
    const state = get();

    let updatedSessions = state.sessions;
    if (state.activeSessionId) {
      updatedSessions = state.sessions.map((s) =>
        s.id === state.activeSessionId
          ? { ...s, messages: [], title: 'New chat', updatedAt: Date.now() }
          : s
      );
      saveStoredSessions(updatedSessions, state.activeSessionId);
    }

    set({ messages: [], activeNudge: null, sessions: updatedSessions });
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

    await get().sendMessage(continuationPrompt, {
      isAgenticContinuation: true,
      role: 'user',
      autoApproveSafeTools: true,
    });
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
        case 'write_file': {
          result = await writeFile(execution.args.path, execution.args.content ?? '');
          break;
        }
        case 'list_directory': {
          result = await searchFiles(execution.args.dir || './', '');
          break;
        }
        case 'fetch_url': {
          result = await fetchUrl(execution.args.url);
          break;
        }
        case 'search_memory': {
          const ws = useWorkspaceStore.getState().activeWorkspace;
          const limit = typeof execution.args.limit === 'number' ? execution.args.limit : 5;
          try {
            const reranked = await rerankMemories(execution.args.query, ws?.id, false, limit);
            result = reranked.map((r) => ({
              id: r.memory_id,
              content: r.content,
              category: r.category,
              relevance: r.final_score,
            }));
          } catch {
            result = await searchMemories(execution.args.query, ws?.id, false, limit);
          }
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
        case 'gui_action': {
          if (isHaltActive()) {
            throw new Error('Emergency stop active: hardware kill switch triggered. GUI action aborted.');
          }

          const settings = useSettingsStore.getState();
          if (!settings.computerControlEnabled) {
            throw new Error('Security Policy Refusal: Computer Control master switch is disabled in Settings.');
          }

          const intent: ActionIntent = {
            targetAppBundleId:
              execution.args.intent?.targetAppBundleId ||
              execution.args.targetAppBundleId ||
              execution.args.bundleId ||
              '',
            naturalLanguageIntent:
              execution.args.intent?.naturalLanguageIntent ||
              execution.args.naturalLanguageIntent ||
              execution.args.intent ||
              'GUI Action',
            targetElementDescription:
              execution.args.intent?.targetElementDescription ||
              execution.args.targetElementDescription ||
              execution.args.element ||
              '',
            intendedStateChange:
              execution.args.intent?.intendedStateChange ||
              execution.args.intendedStateChange ||
              'Unknown',
          };

          if (!intent.targetAppBundleId) {
            throw new Error('GUI action rejected: missing target application bundle identifier.');
          }

          if (isHardBlocked(intent.targetAppBundleId)) {
            throw new Error(`Security Policy Refusal: '${intent.targetAppBundleId}' is hard-blocked and cannot be automated under any circumstance.`);
          }

          const allowlist = settings.computerControlAllowlist.map((b) => b.trim().toLowerCase());
          if (!allowlist.includes(intent.targetAppBundleId.trim().toLowerCase())) {
            throw new Error(`Security Policy Refusal: '${intent.targetAppBundleId}' is not in the Computer Control allowlist.`);
          }

          const targetAppName = execution.args.targetAppName || intent.targetAppBundleId;
          await showControlOverlay(targetAppName, intent.targetAppBundleId, intent.naturalLanguageIntent, 1, 1);

          try {
            const rawAction = execution.args.action || {};
            const actionType = rawAction.actionType || execution.args.actionType || 'click';
            let targetX = rawAction.x ?? execution.args.x;
            let targetY = rawAction.y ?? execution.args.y;
            let groundingVerdict = execution.args.grounding;

            if (
              (actionType === 'click' || actionType === 'move') &&
              (targetX === undefined || targetY === undefined) &&
              intent.targetElementDescription
            ) {
              if (!settings.groundingEndpointUrl) {
                throw new Error(
                  'Grounding required: Action coordinates (x, y) were not specified and no Grounding Endpoint URL is configured in Settings.'
                );
              }

              const groundingRes = await resolveGroundingTarget(
                settings.groundingEndpointUrl,
                {
                  image: execution.args.image || '',
                  instruction: intent.targetElementDescription,
                  targetAppName,
                  windowBounds: execution.args.windowBounds,
                }
              );

              targetX = groundingRes.coordinate.x;
              targetY = groundingRes.coordinate.y;
              groundingVerdict = {
                model_endpoint: groundingRes.modelEndpoint,
                predicted_coordinate: groundingRes.coordinate,
                bounding_box: groundingRes.boundingBox,
                confidence: groundingRes.confidence,
              };
            }

            let action: ComputerAction;

            if (actionType === 'type') {
              action = { actionType: 'type', text: rawAction.text ?? execution.args.text ?? '' };
            } else if (actionType === 'keyCombo') {
              action = { actionType: 'keyCombo', keys: rawAction.keys ?? execution.args.keys ?? [] };
            } else if (actionType === 'scroll') {
              action = { actionType: 'scroll', dx: rawAction.dx ?? execution.args.dx ?? 0, dy: rawAction.dy ?? execution.args.dy ?? 0 };
            } else if (actionType === 'drag') {
              action = {
                actionType: 'drag',
                startX: rawAction.startX ?? execution.args.startX ?? 0,
                startY: rawAction.startY ?? execution.args.startY ?? 0,
                endX: rawAction.endX ?? execution.args.endX ?? 0,
                endY: rawAction.endY ?? execution.args.endY ?? 0,
              };
            } else if (actionType === 'move') {
              action = { actionType: 'move', x: targetX ?? 0, y: targetY ?? 0 };
            } else {
              action = {
                actionType: 'click',
                x: targetX ?? 0,
                y: targetY ?? 0,
                button: rawAction.button || execution.args.button || 'left',
                double: rawAction.double || execution.args.double || false,
              };
            }

            const actionRequest: SimulatedActionRequest = {
              intent,
              action,
              stepNumber: 1,
              totalSteps: 1,
              operatorApproved: true,
            };

            const receipt = await executeActionWithVisualAudit(
              actionRequest,
              messageId,
              execution.args.windowTitle,
              groundingVerdict
            );

            if (receipt.execution.kill_switch_triggered || receipt.execution.status === 'ABORTED_BY_KILL_SWITCH') {
              throw new Error('Action aborted by hardware emergency kill switch.');
            }
            if (receipt.execution.status === 'REFUSED_SECURITY_POLICY') {
              throw new Error(`Action refused by security policy: ${receipt.execution.status}`);
            }

            result = receipt;
          } finally {
            await hideControlOverlay();
          }
          break;
        }
        case 'set_system_volume': {
          const level = typeof execution.args.level === 'number' ? execution.args.level : (typeof execution.args.volume === 'number' ? execution.args.volume : 50);
          result = await setSystemVolume(level);
          break;
        }
        case 'get_system_volume': {
          result = await getSystemVolume();
          break;
        }
        case 'set_system_mute': {
          const mute = typeof execution.args.mute === 'boolean' ? execution.args.mute : true;
          result = await setSystemMute(mute);
          break;
        }
        case 'play_spotify': {
          const query = execution.args.query || execution.args.song || execution.args.track || '';
          result = await playSpotify(query);
          break;
        }
        case 'media_control': {
          const action = execution.args.action || 'playpause';
          result = await mediaControl(action);
          break;
        }
        case 'searxng_search': {
          const query = execution.args.query || execution.args.search || '';
          const searchRes = await searchSearxng(query);
          if (!searchRes.success || !searchRes.context) {
            result = searchRes.message || 'No reliable information was found.';
          } else {
            result = `Web Search Context:\n${searchRes.context}\n\nSources:\n` +
              searchRes.results.map((r, i) => `${i + 1}. [${r.title}](${r.url})`).join('\n');
          }
          break;
        }
        case 'search_web': {
          const query = execution.args.query || execution.args.search || '';
          const platform = execution.args.platform;
          if (platform === 'searxng') {
            const searchRes = await searchSearxng(query);
            if (!searchRes.success || !searchRes.context) {
              result = searchRes.message || 'No reliable information was found.';
            } else {
              result = `Web Search Context:\n${searchRes.context}\n\nSources:\n` +
                searchRes.results.map((r, i) => `${i + 1}. [${r.title}](${r.url})`).join('\n');
            }
          } else {
            result = execution.args.app
              ? await searchWebPlatform(query, platform || 'google', execution.args.app)
              : await searchWebPlatform(query, platform || 'google');
          }
          break;
        }
        case 'lock_screen': {
          result = await lockScreen();
          break;
        }
        case 'open_app': {
          const appName = execution.args.name || execution.args.app || execution.args.appName || execution.args.target || '';
          result = await openApp(appName);
          break;
        }
        case 'simulate_key_press': {
          const key = execution.args.key || 'enter';
          result = await simulateKeyPress(key);
          break;
        }
        case 'simulate_scroll': {
          const direction = execution.args.direction || 'down';
          const amount = execution.args.amount || 6;
          result = await simulateScroll(direction, amount);
          break;
        }
        case 'inject_text': {
          const text = execution.args.text || '';
          result = await injectTextToActiveApp(text);
          break;
        }
        case 'math_evaluate': {
          const expr = execution.args.expression || execution.args.expr || '';
          result = evaluateMath(expr, { angle: execution.args.angle });
          break;
        }
        case 'math_solve': {
          if (Array.isArray(execution.args.equations) && execution.args.equations.length > 0) {
            result = solveSystem(execution.args.equations);
          } else {
            const eq = execution.args.equation || execution.args.eq || '';
            result = solveEquation(eq);
          }
          break;
        }
        case 'ui_command': {
          const action = execution.args.action || 'key';
          if (action === 'key') {
            result = await simulateKeyPress(execution.args.key || 'enter');
          } else if (action === 'scroll') {
            result = await simulateScroll(execution.args.direction || 'down', execution.args.amount || 6);
          } else if (action === 'open_app') {
            result = await openApp(execution.args.app || execution.args.appName || '');
          } else {
            throw new Error(`Unknown UI command action: ${action}`);
          }
          break;
        }
        case 'browse_page': {
          const url = execution.args.url || '';
          result = await browsePage(url);
          break;
        }
        case 'extract_links': {
          const url = execution.args.url || '';
          const sameDomainOnly = Boolean(execution.args.sameDomainOnly ?? execution.args.same_domain_only);
          result = await extractPageLinks(url, sameDomainOnly);
          break;
        }
        default: {
          result = await executeAgentTool(execution.toolName, execution.args);
          break;
        }
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

  approvePlan: async (messageId: string) => {
    const message = get().messages.find((m) => m.id === messageId);
    if (!message || !message.plan) return;
    const updatedPlan: ExecutionPlan = {
      ...message.plan,
      status: 'running',
    };
    get().updateMessageContent(
      messageId,
      message.content,
      false,
      message.recalledMemories,
      message.proposedMemories,
      message.toolExecutions,
      message.providerInfo,
      message.activeWindowContext,
      message.reasoning,
      updatedPlan
    );
    await get().executePlan(messageId);
  },

  cancelPlan: (messageId: string) => {
    const message = get().messages.find((m) => m.id === messageId);
    if (!message || !message.plan) return;
    const cancelledSteps = message.plan.steps.map((s, idx) => {
      if (idx >= message.plan!.currentStepIndex && s.status !== 'completed') {
        return { ...s, status: 'cancelled' as const };
      }
      return s;
    });
    const updatedPlan: ExecutionPlan = {
      ...message.plan,
      status: 'cancelled',
      stoppedReason: 'Execution cancelled by user.',
      steps: cancelledSteps,
    };
    set({ activeRunningPlanMessageId: null });
    get().updateMessageContent(
      messageId,
      message.content,
      false,
      message.recalledMemories,
      message.proposedMemories,
      message.toolExecutions,
      message.providerInfo,
      message.activeWindowContext,
      message.reasoning,
      updatedPlan
    );
  },

  executePlan: async (messageId: string) => {
    set({ activeRunningPlanMessageId: messageId });
    const message = get().messages.find((m) => m.id === messageId);
    if (!message || !message.plan) return;

    const plan = { ...message.plan, status: 'running' as const };
    const steps = [...plan.steps];
    const currentTools: ToolExecution[] = [...(message.toolExecutions || [])];

    let failedStepIndex = -1;
    let failureError: string | null = null;

    const broadcastStepUpdate = (stepText: string | null) => {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        import('@tauri-apps/api/event')
          .then(({ emit }) => {
            emit('autonomous-step-update', { stepText });
          })
          .catch(() => {});
      }
    };

    for (let i = 0; i < steps.length; i++) {
      // Check if cancelled
      const freshMessage = get().messages.find((m) => m.id === messageId);
      if (!freshMessage || !freshMessage.plan || freshMessage.plan.status === 'cancelled') {
        broadcastStepUpdate(null);
        set({ activeRunningPlanMessageId: null });
        return;
      }

      steps[i] = { ...steps[i], status: 'running' };
      plan.currentStepIndex = i;
      plan.steps = [...steps];
      if (i < currentTools.length) {
        currentTools[i] = { ...currentTools[i], status: 'running' };
      }
      broadcastStepUpdate(`Step ${i + 1}/${steps.length}: ${steps[i].description}`);
      get().updateMessageContent(
        messageId,
        freshMessage.content,
        false,
        freshMessage.recalledMemories,
        freshMessage.proposedMemories,
        currentTools,
        freshMessage.providerInfo,
        freshMessage.activeWindowContext,
        freshMessage.reasoning,
        { ...plan }
      );

      const step = steps[i];
      let stepResult: any = null;
      let isError = false;
      let errorMsg = '';

      try {
        switch (step.toolName) {
          case 'run_shell': {
            const shellRes = await runShellCommand(step.args.command, step.args.cwd);
            stepResult = shellRes;
            if (shellRes.exit_code !== 0) {
              isError = true;
              errorMsg = `Command exited with status ${shellRes.exit_code}: ${shellRes.stderr || shellRes.stdout}`;
            }
            break;
          }
          case 'read_file': {
            stepResult = await readFile(step.args.path);
            break;
          }
          case 'write_file': {
            stepResult = await writeFile(step.args.path, step.args.content ?? '');
            break;
          }
          case 'list_directory': {
            stepResult = await searchFiles(step.args.dir || './', '');
            break;
          }
          case 'fetch_url': {
            stepResult = await fetchUrl(step.args.url);
            break;
          }
          case 'search_memory': {
            const ws = useWorkspaceStore.getState().activeWorkspace;
            const limit = typeof step.args.limit === 'number' ? step.args.limit : 5;
            try {
              const reranked = await rerankMemories(step.args.query, ws?.id, false, limit);
              stepResult = reranked.map((r) => ({
                id: r.memory_id,
                content: r.content,
                category: r.category,
                relevance: r.final_score,
              }));
            } catch {
              stepResult = await searchMemories(step.args.query, ws?.id, false, limit);
            }
            break;
          }

          case 'search_files': {
            stepResult = await searchFiles(step.args.dir || './', step.args.query || '');
            break;
          }
          case 'read_clipboard': {
            stepResult = await readClipboard();
            break;
          }
          case 'write_clipboard': {
            await writeClipboard(step.args.text || '');
            stepResult = 'Content written to clipboard';
            break;
          }
          case 'open_target': {
            const target = step.args.target || step.args.path || step.args.url || '';
            stepResult = await openTarget(target);
            break;
          }
          case 'gui_action': {
            // Hardware Kill Switch check (Pillar 4)
            if (isHaltActive()) {
              throw new Error('Emergency stop active: hardware kill switch triggered. GUI action aborted.');
            }

            const settings = useSettingsStore.getState();

            // Master switch check (Pillar 1)
            if (!settings.computerControlEnabled) {
              throw new Error('Security Policy Refusal: Computer Control master switch is disabled in Settings.');
            }

            // Extract intent (Pillar 2)
            const intent: ActionIntent = {
              targetAppBundleId:
                step.args.intent?.targetAppBundleId ||
                step.args.targetAppBundleId ||
                step.args.bundleId ||
                '',
              naturalLanguageIntent:
                step.args.intent?.naturalLanguageIntent ||
                step.args.naturalLanguageIntent ||
                step.args.intent ||
                step.description,
              targetElementDescription:
                step.args.intent?.targetElementDescription ||
                step.args.targetElementDescription ||
                step.args.element ||
                '',
              intendedStateChange:
                step.args.intent?.intendedStateChange ||
                step.args.intendedStateChange ||
                'Unknown',
            };

            if (!intent.targetAppBundleId) {
              throw new Error('GUI action rejected: missing target application bundle identifier.');
            }

            // Hard blocklist check (Pillar 1)
            if (isHardBlocked(intent.targetAppBundleId)) {
              throw new Error(`Security Policy Refusal: '${intent.targetAppBundleId}' is hard-blocked and cannot be automated under any circumstance.`);
            }

            // Allowlist check (Pillar 1)
            const allowlist = settings.computerControlAllowlist.map((b) => b.trim().toLowerCase());
            if (!allowlist.includes(intent.targetAppBundleId.trim().toLowerCase())) {
              throw new Error(`Security Policy Refusal: '${intent.targetAppBundleId}' is not in the Computer Control allowlist.`);
            }

            // Upfront human approval modal gate (Pillar 5)
            if (!step.args.operatorApproved) {
              const approval = await requireActionApproval(intent, {
                targetAppName: step.args.targetAppName || intent.targetAppBundleId,
              });
              if (!approval.approved) {
                throw new Error(approval.reason || 'Action rejected by operator.');
              }
            }

            // Re-verify kill switch post-approval
            if (isHaltActive()) {
              throw new Error('Emergency stop active: hardware kill switch triggered before input dispatch.');
            }

            // Active-Control HUD overlay (Pillar 3)
            const targetAppName = step.args.targetAppName || intent.targetAppBundleId;
            await showControlOverlay(
              targetAppName,
              intent.targetAppBundleId,
              intent.naturalLanguageIntent,
              i + 1,
              steps.length
            );

            try {
              const rawAction = step.args.action || {};
              const actionType = rawAction.actionType || step.args.actionType || 'click';
              let targetX = rawAction.x ?? step.args.x;
              let targetY = rawAction.y ?? step.args.y;
              let groundingVerdict = step.args.grounding;

              if (
                (actionType === 'click' || actionType === 'move') &&
                (targetX === undefined || targetY === undefined) &&
                intent.targetElementDescription
              ) {
                if (!settings.groundingEndpointUrl) {
                  throw new Error(
                    'Grounding required: Action coordinates (x, y) were not specified and no Grounding Endpoint URL is configured in Settings.'
                  );
                }

                const groundingRes = await resolveGroundingTarget(
                  settings.groundingEndpointUrl,
                  {
                    image: step.args.image || '',
                    instruction: intent.targetElementDescription,
                    targetAppName,
                    windowBounds: step.args.windowBounds,
                  }
                );

                targetX = groundingRes.coordinate.x;
                targetY = groundingRes.coordinate.y;
                groundingVerdict = {
                  model_endpoint: groundingRes.modelEndpoint,
                  predicted_coordinate: groundingRes.coordinate,
                  bounding_box: groundingRes.boundingBox,
                  confidence: groundingRes.confidence,
                };
              }

              let action: ComputerAction;

              if (actionType === 'type') {
                action = { actionType: 'type', text: rawAction.text ?? step.args.text ?? '' };
              } else if (actionType === 'keyCombo') {
                action = { actionType: 'keyCombo', keys: rawAction.keys ?? step.args.keys ?? [] };
              } else if (actionType === 'scroll') {
                action = { actionType: 'scroll', dx: rawAction.dx ?? step.args.dx ?? 0, dy: rawAction.dy ?? step.args.dy ?? 0 };
              } else if (actionType === 'drag') {
                action = {
                  actionType: 'drag',
                  startX: rawAction.startX ?? step.args.startX ?? 0,
                  startY: rawAction.startY ?? step.args.startY ?? 0,
                  endX: rawAction.endX ?? step.args.endX ?? 0,
                  endY: rawAction.endY ?? step.args.endY ?? 0,
                };
              } else if (actionType === 'move') {
                action = { actionType: 'move', x: targetX ?? 0, y: targetY ?? 0 };
              } else {
                action = {
                  actionType: 'click',
                  x: targetX ?? 0,
                  y: targetY ?? 0,
                  button: rawAction.button || step.args.button || 'left',
                  double: rawAction.double || step.args.double || false,
                };
              }

              const actionRequest: SimulatedActionRequest = {
                intent,
                action,
                stepNumber: i + 1,
                totalSteps: steps.length,
                operatorApproved: true,
              };

              // Visual audit execution (Pillar 7)
              const receipt = await executeActionWithVisualAudit(
                actionRequest,
                messageId,
                step.args.windowTitle,
                groundingVerdict
              );

              if (receipt.execution.kill_switch_triggered || receipt.execution.status === 'ABORTED_BY_KILL_SWITCH') {
                throw new Error('Action aborted by hardware emergency kill switch.');
              }
              if (receipt.execution.status === 'REFUSED_SECURITY_POLICY') {
                throw new Error(`Action refused by security policy: ${receipt.execution.status}`);
              }

              stepResult = receipt;
            } finally {
              await hideControlOverlay();
            }
            break;
          }
          case 'set_system_volume': {
            const level = typeof step.args.level === 'number' ? step.args.level : (typeof step.args.volume === 'number' ? step.args.volume : 50);
            stepResult = await setSystemVolume(level);
            break;
          }
          case 'get_system_volume': {
            stepResult = await getSystemVolume();
            break;
          }
          case 'set_system_mute': {
            const mute = typeof step.args.mute === 'boolean' ? step.args.mute : true;
            stepResult = await setSystemMute(mute);
            break;
          }
          case 'play_spotify': {
            const query = step.args.query || step.args.song || step.args.track || '';
            stepResult = await playSpotify(query);
            break;
          }
          case 'media_control': {
            const action = step.args.action || 'playpause';
            stepResult = await mediaControl(action);
            break;
          }
          case 'searxng_search': {
            const query = step.args.query || step.args.search || '';
            const searchRes = await searchSearxng(query);
            if (!searchRes.success || !searchRes.context) {
              stepResult = searchRes.message || 'No reliable information was found.';
            } else {
              stepResult = `Web Search Context:\n${searchRes.context}\n\nSources:\n` +
                searchRes.results.map((r, i) => `${i + 1}. [${r.title}](${r.url})`).join('\n');
            }
            break;
          }
          case 'search_web': {
            const query = step.args.query || step.args.search || '';
            const platform = step.args.platform;
            if (platform === 'searxng') {
              const searchRes = await searchSearxng(query);
              if (!searchRes.success || !searchRes.context) {
                stepResult = searchRes.message || 'No reliable information was found.';
              } else {
                stepResult = `Web Search Context:\n${searchRes.context}\n\nSources:\n` +
                  searchRes.results.map((r, i) => `${i + 1}. [${r.title}](${r.url})`).join('\n');
              }
            } else {
              stepResult = step.args.app
                ? await searchWebPlatform(query, platform || 'google', step.args.app)
                : await searchWebPlatform(query, platform || 'google');
            }
            break;
          }
          case 'lock_screen': {
            stepResult = await lockScreen();
            break;
          }
          case 'open_app': {
            const appName = step.args.name || step.args.app || step.args.appName || step.args.target || '';
            stepResult = await openApp(appName);
            break;
          }
          case 'simulate_key_press': {
            const key = step.args.key || step.args.keyName || 'enter';
            stepResult = await simulateKeyPress(key);
            break;
          }
          case 'simulate_scroll': {
            const direction = step.args.direction || 'down';
            const amount = typeof step.args.amount === 'number' ? step.args.amount : 6;
            stepResult = await simulateScroll(direction, amount);
            break;
          }
          case 'inject_text': {
            const text = step.args.text || step.args.content || '';
            stepResult = await injectTextToActiveApp(text);
            break;
          }
          case 'math_evaluate': {
            const expr = step.args.expression || step.args.expr || '';
            stepResult = evaluateMath(expr, { angle: step.args.angle });
            break;
          }
          case 'math_solve': {
            if (Array.isArray(step.args.equations) && step.args.equations.length > 0) {
              stepResult = solveSystem(step.args.equations);
            } else {
              const eq = step.args.equation || step.args.eq || '';
              stepResult = solveEquation(eq);
            }
            break;
          }
          case 'ui_command': {
            const action = step.args.action || 'key';
            if (action === 'key') {
              stepResult = await simulateKeyPress(step.args.key || 'enter');
            } else if (action === 'scroll') {
              stepResult = await simulateScroll(step.args.direction || 'down', step.args.amount || 6);
            } else if (action === 'open_app') {
              stepResult = await openApp(step.args.app || step.args.appName || step.args.name || '');
            } else {
              throw new Error(`Unknown UI command action: ${action}`);
            }
            break;
          }
          case 'browse_page': {
            const url = step.args.url || '';
            stepResult = await browsePage(url);
            break;
          }
          case 'extract_links': {
            const url = step.args.url || '';
            const sameDomainOnly = Boolean(step.args.sameDomainOnly ?? step.args.same_domain_only);
            stepResult = await extractPageLinks(url, sameDomainOnly);
            break;
          }
          default: {
            stepResult = await executeAgentTool(step.toolName, step.args);
            break;
          }
        }
      } catch (err: unknown) {
        isError = true;
        errorMsg = err instanceof Error ? err.message : String(err);

        // Self-Correction Loop for read_file: If file not found, attempt locating file in current directory
        if (step.toolName === 'read_file' && step.args?.path) {
          try {
            const rawPath = String(step.args.path);
            const fileName = rawPath.split('/').pop()?.split('\\').pop();
            if (fileName) {
              const matches = await searchFiles('./', fileName);
              if (matches && matches.length > 0) {
                const correctedPath = matches[0].path;
                const retryResult = await readFile(correctedPath);
                stepResult = retryResult;
                isError = false;
                errorMsg = '';
                step.args.path = correctedPath;
              }
            }
          } catch {
            // Keep original error if self-correction cannot resolve
          }
        }
      }

      // Add or update audit receipt in toolExecutions
      const toolReceipt: ToolExecution = {
        id: step.id,
        toolName: step.toolName,
        args: step.args,
        status: isError ? 'error' : 'completed',
        isDestructive: step.isDestructive,
        result: stepResult,
        error: isError ? errorMsg : undefined,
      };
      if (i < currentTools.length) {
        currentTools[i] = toolReceipt;
      } else {
        currentTools.push(toolReceipt);
      }

      if (isError) {
        steps[i] = { ...steps[i], status: 'failed', error: errorMsg, result: stepResult };
        failedStepIndex = i;
        failureError = errorMsg;
        // Mark subsequent steps as cancelled
        for (let j = i + 1; j < steps.length; j++) {
          steps[j] = { ...steps[j], status: 'cancelled' };
        }
        break;
      } else {
        steps[i] = { ...steps[i], status: 'completed', result: stepResult };
      }
    }

    broadcastStepUpdate(null);
    set({ activeRunningPlanMessageId: null });
    const freshMessage = get().messages.find((m) => m.id === messageId);
    if (!freshMessage) return;

    if (failedStepIndex !== -1) {
      const stoppedReason = `Step ${failedStepIndex + 1} (${steps[failedStepIndex].description}) failed: ${failureError}. Stopped remaining steps.`;
      const finalPlan: ExecutionPlan = {
        ...plan,
        status: 'failed',
        steps,
        stoppedReason,
      };
      get().updateMessageContent(
        messageId,
        freshMessage.content,
        false,
        freshMessage.recalledMemories,
        freshMessage.proposedMemories,
        currentTools,
        freshMessage.providerInfo,
        freshMessage.activeWindowContext,
        freshMessage.reasoning,
        finalPlan
      );
    } else {
      const planSummary = `Plan executed successfully: all ${steps.length} steps completed.`;
      const finalPlan: ExecutionPlan = {
        ...plan,
        status: 'completed',
        steps,
        summary: planSummary,
      };
      get().updateMessageContent(
        messageId,
        freshMessage.content,
        false,
        freshMessage.recalledMemories,
        freshMessage.proposedMemories,
        currentTools,
        freshMessage.providerInfo,
        freshMessage.activeWindowContext,
        freshMessage.reasoning,
        finalPlan
      );

      speakJARVISFeedback(planSummary);
    }
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
    options?: { isAgenticContinuation?: boolean; role?: 'user' | 'system'; autoApproveSafeTools?: boolean }
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

    // 1.5 Task Intent Classification (Native Rust System One Engine)
    let taskIntent: SystemOneTaskIntentVerdict | undefined = undefined;
    try {
      taskIntent = await classifyUserTask(trimmed);
    } catch {
      // Non-blocking fallback for browser/test environments
    }

    // 1.6 Instant System One Fast-Path Action Execution (< 30ms dispatch)
    const instantAction = matchInstantAction(trimmed);
    if (instantAction && !options?.isAgenticContinuation) {
      const isManualApprovalRequired = options?.autoApproveSafeTools === false;
      const initialStatus = isManualApprovalRequired ? 'pending_approval' : 'running';

      const assistantId = get().addMessage({
        role: 'assistant',
        content: instantAction.statusText,
        isStreaming: false,
        workspaceId: wsId,
        providerInfo: {
          providerId: 'aeio-fast-engine',
          modelName: 'System One Instant Action',
          isLocal: true,
        },
        toolExecutions: [
          {
            id: crypto.randomUUID(),
            toolName: instantAction.toolName,
            args: instantAction.args,
            status: initialStatus,
            isDestructive: instantAction.isDestructive,
            riskTier: instantAction.riskTier,
          },
        ],
      });

      if (isManualApprovalRequired) {
        set({ isLoading: false });
        return;
      }

      set({ isLoading: true });

      try {
        let result: any = null;
        switch (instantAction.toolName) {
          case 'open_app': {
            result = await openApp(instantAction.args.name);
            break;
          }
          case 'set_system_volume': {
            result = await setSystemVolume(instantAction.args.level);
            break;
          }
          case 'set_system_mute': {
            result = await setSystemMute(instantAction.args.mute);
            break;
          }
          case 'media_control': {
            result = await mediaControl(instantAction.args.action);
            break;
          }
          case 'play_spotify': {
            result = await playSpotify(instantAction.args.query);
            break;
          }
          case 'search_web': {
            result = instantAction.args.app
              ? await searchWebPlatform(instantAction.args.query, instantAction.args.platform, instantAction.args.app)
              : await searchWebPlatform(instantAction.args.query, instantAction.args.platform);
            break;
          }
          case 'lock_screen': {
            result = await lockScreen();
            break;
          }
          case 'math_evaluate': {
            const mathRes = evaluateMath(instantAction.args.expression);
            result = mathRes.text || String(mathRes.value);
            break;
          }
          case 'open_target': {
            result = await openTarget(instantAction.args.target);
            break;
          }
          case 'read_clipboard': {
            result = await readClipboard();
            break;
          }
          case 'get_system_volume': {
            result = await getSystemVolume();
            break;
          }
          case 'simulate_key_press': {
            result = await simulateKeyPress(instantAction.args.key);
            break;
          }
          case 'simulate_scroll': {
            result = await simulateScroll(instantAction.args.direction, instantAction.args.amount);
            break;
          }
          case 'manage_window': {
            result = await manageActiveWindow(instantAction.args.action);
            break;
          }
          case 'search_local_files': {
            result = await searchLocalFiles(instantAction.args.query, instantAction.args.limit);
            break;
          }
          case 'get_power_status': {
            result = await getPowerStatus();
            break;
          }
          default: {
            result = await executeAgentTool(instantAction.toolName, instantAction.args);
            break;
          }
        }

        const msg = get().messages.find((m) => m.id === assistantId);
        if (msg && msg.toolExecutions) {
          const updatedTools = [...msg.toolExecutions];
          updatedTools[0] = {
            ...updatedTools[0],
            status: 'approved',
            result,
          };

          let finalMsg = instantAction.completedMessage;
          if (instantAction.toolName === 'math_evaluate' && result !== null && result !== undefined) {
            finalMsg = `${instantAction.args.expression} = ${result}`;
          } else if (instantAction.toolName === 'read_clipboard') {
            finalMsg = result ? `Clipboard content:\n\`\`\`\n${result}\n\`\`\`` : 'Clipboard is empty.';
          } else if (instantAction.toolName === 'get_system_volume') {
            const vol = typeof result === 'object' && result !== null ? (result.level ?? result.volume ?? JSON.stringify(result)) : result;
            finalMsg = `Current system volume is ${vol}%.`;
          } else if (instantAction.toolName === 'get_power_status' && result) {
            const chargeStr = result.is_charging ? 'Charging' : 'Discharging';
            const timeStr = result.time_remaining_minutes ? `, ~${result.time_remaining_minutes} min remaining` : '';
            finalMsg = `Battery is at ${result.percentage}% (${chargeStr} on ${result.power_source}${timeStr}).`;
          } else if (instantAction.toolName === 'search_local_files' && Array.isArray(result)) {
            if (result.length === 0) {
              finalMsg = `No local files found matching "${instantAction.args.query}".`;
            } else {
              const items = result.slice(0, 8).map((f: any) => `- \`${f.path}\``).join('\n');
              finalMsg = `Found ${result.length} matching file${result.length > 1 ? 's' : ''} for "${instantAction.args.query}":\n${items}`;
            }
          }

          get().updateMessageContent(
            assistantId,
            finalMsg,
            false,
            undefined,
            undefined,
            updatedTools,
            msg.providerInfo
          );
        }

        set({ isLoading: false, lastFailedPrompt: null });
        return;
      } catch (actionErr: any) {
        const errorMsg = actionErr?.message || String(actionErr);
        const msg = get().messages.find((m) => m.id === assistantId);
        if (msg && msg.toolExecutions) {
          const updatedTools = [...msg.toolExecutions];
          updatedTools[0] = {
            ...updatedTools[0],
            status: 'error',
            result: errorMsg,
          };
          get().updateMessageContent(
            assistantId,
            `Failed to execute ${instantAction.toolName}: ${errorMsg}`,
            false,
            undefined,
            undefined,
            updatedTools,
            msg.providerInfo
          );
        }
        set({ isLoading: false, error: errorMsg });
        return;
      }
    }

    // Direct OS control / quick action check: bypass heavy vector reranking to achieve sub-second execution!
    const isDirectOsCommand =
      taskIntent?.primary_intent === 'os_control' ||
      /^(?:open|launch|play|pause|mute|unmute|set volume|volume|search youtube|search web|lock screen|take screenshot)\b/i.test(trimmed);

    // 2. Search relevant memories strictly scoped to active workspace (Tier 1 & Tier 4 Scoped Recall)
    let recalled: RecalledMemory[] = [];
    if (!options?.isAgenticContinuation && !isDirectOsCommand) {
      try {
        const reranked = await rerankMemories(trimmed, wsId, false, 5);
        recalled = reranked
          .filter((r) => r.final_score >= 35.0 || r.confidence >= 0.70)
          .slice(0, 4)
          .map((r) => ({
            id: r.memory_id,
            content: r.content,
            category: r.category,
          }));
      } catch {
        try {
          const searchResults = await searchMemories(trimmed, wsId, false, 5);
          const reranked = await rerankMemoriesSystemOne(trimmed, searchResults);
          const candidates = reranked.length > 0 ? reranked.map((r) => r.searchResult) : searchResults;
          recalled = candidates
            .filter((r) => r.score >= 0.6)
            .slice(0, 4)
            .map((r) => ({
              id: r.memory.id,
              content: r.memory.content,
              category: r.memory.category,
            }));
        } catch (err) {
          console.warn('Memory search before prompt failed:', err);
        }
      }
    }

    // 3. Provider info & sensitivity calculation
    const settings = useSettingsStore.getState();
    const providerId = settings.activeProvider;
    const modelName =
      providerId === 'bedrock'
        ? settings.bedrockModel || 'amazon.nova-lite-v1:0'
        : providerId === 'qwen-coder'
        ? settings.ollamaModel || 'qwen2.5:7b'
        : providerId === 'ollama'
        ? settings.ollamaModel || 'llama3.2'
        : providerId === 'claude'
        ? 'claude-3-5-sonnet'
        : providerId === 'aeio-free'
        ? 'claude-3-5-haiku'
        : providerId === 'gemini'
        ? 'gemini-2.0-flash'
        : 'gpt-4o';
    const isLocal = providerId === 'qwen-coder' || providerId === 'ollama';
    const isCloud = providerId === 'bedrock' || providerId === 'claude' || providerId === 'openai' || providerId === 'aeio-free' || providerId === 'gemini';

    // Tier 3.2: Sensitive-Content Routing Gate
    // If querying an external cloud provider and the privacy lock is enabled, strip memory context completely!
    let memoriesWithheldCount = 0;
    if (isCloud && settings.neverSendMemoriesToCloud && recalled.length > 0) {
      memoriesWithheldCount = recalled.length;
      recalled = [];
    }

    const providerInfo: ProviderBadgeInfo = {
      providerId,
      modelName,
      isLocal,
      isPrivacyProtected: isLocal || memoriesWithheldCount > 0,
      memoriesWithheld: memoriesWithheldCount > 0 ? memoriesWithheldCount : undefined,
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

    // 5. Build system prompt for high-performance Aeio Assistant
    let systemPrompt =
      'You are Aeio, an intelligent, helpful, and high-performance desktop AI assistant powered by AWS Bedrock cloud intelligence.\n' +
      'You specialize in programming, systems automation, shell scripting, code analysis, web search, media control, and local desktop tasks.\n';

    if (taskIntent?.suggested_system_prompt) {
      systemPrompt += `Task Intent Mode [${taskIntent.primary_intent.toUpperCase()} (${Math.round(taskIntent.confidence * 100)}% confidence)]: ${taskIntent.suggested_system_prompt}\n`;
    }

    systemPrompt +=
      'Always adhere to these guidelines:\n' +
      '1. Be direct, precise, and concise. Never use emojis or conversational fluff.\n' +
      '2. For non-trivial code analysis, logic, or multi-step decisions, output your internal reasoning inside <think>Your thought process</think> before your final response.\n' +
      '3. Conversational queries, status inquiries, greetings, explanations, and capability questions must be answered DIRECTLY in natural language. Never call search_memory or other tools for general conversation unless the user explicitly requests searching past memories, files, or notes.\n' +
      '4. You have access to local host tools. ONLY output a tool call when the user explicitly requests a concrete host action or external file/API retrieval. Output tool calls using:\n' +
      '   <tool_call name="tool_name" args=\'{"param":"val"}\'></tool_call>\n' +
      '5. Available host tools:\n' +
      '   - search_web: Search the web via SearXNG for real-time information, or platforms (Google, YouTube, GitHub). Arguments: {"query": "...", "platform": "searxng"|"google"|"youtube"}\n' +
      '   - searxng_search: Query SearXNG for real-time information, current events, or facts. Arguments: {"query": "..."}\n' +
      '   - run_shell: Execute shell commands. Arguments: {"command": "...", "cwd": "optional_path"}\n' +
      '   - read_file: Read file contents. Arguments: {"path": "..."}\n' +
      '   - write_file: Write or create a file with specified contents. Arguments: {"path": "...", "content": "..."}\n' +
      '   - search_files: Search directory for files matching query. Arguments: {"dir": ".", "query": "..."}\n' +
      '   - list_directory: List files and folders in directory. Arguments: {"dir": "."}\n' +
      '   - fetch_url: Fetch and read URL content (HTTP/HTTPS web pages, API JSON, or raw documentation). Arguments: {"url": "..."}\n' +
      '   - browse_page: Scrape and parse any webpage into clean Markdown with title and metadata. Arguments: {"url": "..."}\n' +
      '   - extract_links: Extract and filter navigation/resource links from webpage. Arguments: {"url": "...", "sameDomainOnly": true}\n' +
      '   - search_memory: Query stored user preferences, facts, project context. Arguments: {"query": "...", "limit": 5}\n' +
      '   - open_target: Open file, directory, application, or URL with default OS handler. Arguments: {"target": "..."}\n' +
      '   - read_clipboard: Inspect clipboard text. Arguments: {}\n' +
      '   - write_clipboard: Copy text to clipboard. Arguments: {"text": "..."}\n' +
      '   - open_app: Launch or focus desktop applications, websites, or services (e.g. YouTube, Spotify, Chrome, Terminal). Arguments: {"name": "..."}\n' +
      '   - simulate_key_press: Press keys (enter, escape, tab, space, backspace, up, down). Arguments: {"key": "enter"}\n' +
      '   - simulate_scroll: Scroll active window up or down. Arguments: {"direction": "up"|"down", "amount": 6}\n' +
      '   - inject_text: Type or paste text into active focused application. Arguments: {"text": "..."}\n' +
      '   - math_evaluate: Evaluate accurate arithmetic and mathematical expressions. Arguments: {"expression": "..."}\n' +
      '   - math_solve: Solve algebraic equations or linear systems. Arguments: {"equation": "..."}\n' +
      '   - set_system_volume: Set master system volume (0-100). Arguments: {"level": 50}\n' +
      '   - play_spotify: Play track or artist in Spotify. Arguments: {"query": "..."}\n' +
      '   - media_control: Play/pause/next/previous media playback. Arguments: {"action": "playpause"|"next"|"previous"}\n' +
      '   - lock_screen: Lock desktop screen immediately. Arguments: {}\n' +
      '   - puppeteer_search_and_navigate: Automate headless browser search (DuckDuckGo), navigate to target destination (e.g. YouTube), and save screenshot. Arguments: {"query": "...", "outputPath": "mrbeast.png", "engine": "duckduckgo", "headless": true}\n' +
      '   - puppeteer_screenshot: Capture headless or headed screenshot of any webpage. Arguments: {"url": "...", "outputPath": "screenshot.png", "headless": true}\n' +
      '   - puppeteer_action: Execute programmatic headless browser actions (scrape, screenshot, pdf). Arguments: {"action": "scrape"|"screenshot"|"pdf", "url": "...", "outputPath": "file.png", "headless": true}\n' +
      (useSettingsStore.getState().computerControlEnabled
        ? '   - gui_action: Execute desktop GUI action on allowlisted application. Arguments: {"intent": {"targetAppBundleId": "...", "naturalLanguageIntent": "...", "targetElementDescription": "...", "intendedStateChange": "..."}, "action": {"actionType": "click"|"type"|"keyCombo"|"scroll"|"drag", ...}}\n'
        : '') +
      '5. When tool execution outputs are fed back to you, analyze the result and deliver the synthesized answer or next action.\n' +
      '6. FAST ACTION EXECUTION: When the user asks to open an app, website, search, play music/video, change volume, or run desktop actions, immediately output a direct <tool_call> without unnecessary boilerplate. Direct tool calls execute in milliseconds.\n' +
      '   Example: <tool_call name="search_web" args=\'{"query": "song name", "platform": "youtube"}\'></tool_call>\n' +
      '   Or: <tool_call name="open_app" args=\'{"name": "Chrome"}\'></tool_call>\n' +
      '7. MULTI-STEP PLANS: If and only if a complex task strictly requires a coordinated multi-step workflow across different tools, emit:\n' +
      '   <plan title="Descriptive title of the overall plan">\n' +
      '     <step number="1" tool="search_web" description="Explanation of step">{"query": "...", "platform": "youtube"}</step>\n' +
      '     <step number="2" tool="run_shell" description="Explanation of step">{"command": "..."}</step>\n' +
      '   </plan>\n' +
      '8. Direct execution: When the user asks to open an app, website, search, or play media (e.g. "open YouTube and play X"), EXECUTE IT DIRECTLY using host tools or <plan>. Never ask confirmation or clarifying questions like "Do you want to proceed with this plan?" or "Could you confirm the song name?". Take immediate action with sensible defaults.\n' +
      '9. WEB SEARCH & FACT VERIFICATION: When the user\'s question requires real-time information, current events, or facts you are uncertain about, call the search tool first instead of guessing.\n' +
      '   Search tool call format: <tool_call name="search_web" args=\'{"query": "...", "platform": "searxng"}\'></tool_call> (or <tool_call name="searxng_search" args=\'{"query": "..."}\'></tool_call>)\n' +
      '   The search tool queries GET {SEARXNG_URL}/search?q={query}&format=json&language=en, reads the title, url, and content fields from the returned results, filters the 1-3 most relevant results based on content, and returns concatenated content as context.\n' +
      '   Answer the user\'s question based on the returned search context.\n' +
      '   If the search results are irrelevant or empty, inform the user that no reliable information was found, and do not fabricate.';

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
    const streamThrottle = new StreamingThrottle(16);

    let slowNoticeTimer: ReturnType<typeof setTimeout> | null = null;
    let slowWarnTimer: ReturnType<typeof setTimeout> | null = null;

    let orchestrationResult = {
      providerId: providerId as string,
      modelName,
      isLocal,
      taskType: 'conversational' as TaskType,
      recommendedRoute: 'local_first' as ModelRouteTier,
    };

    try {
      const result = await orchestrateChat(conversation, {
        systemPrompt,
        temperature: 0.3,
        maxTokens: 2048,
        onChunk: (chunk) => {
          if (slowNoticeTimer) {
            clearTimeout(slowNoticeTimer);
            slowNoticeTimer = null;
          }
          if (slowWarnTimer) {
            clearTimeout(slowWarnTimer);
            slowWarnTimer = null;
          }

          const isFirstChunk = rawStreamed.length === 0;
          rawStreamed += chunk;

          const renderChunk = () => {
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

            const cleanDisplay = cleanDisplayContent(rawStreamed);
            const isEmittingAction = /<(?:plan|step|tool_call)\b/i.test(rawStreamed);

            get().updateMessageContent(
              assistantId,
              cleanDisplay || (streamReasoning ? 'Thinking...' : isEmittingAction ? 'Executing action...' : '...'),
              true,
              recalled,
              undefined,
              undefined,
              providerInfo,
              activeWinInfo,
              streamReasoning
            );
          };

          if (isFirstChunk) {
            renderChunk();
          } else {
            streamThrottle.schedule(renderChunk);
          }
        },
      });

      orchestrationResult = {
        providerId: result.providerId,
        modelName: result.modelName,
        isLocal: result.isLocal,
        taskType: result.taskType,
        recommendedRoute: result.recommendedRoute || 'local_first',
      };

      // Synchronously flush any pending streamed tokens immediately
      streamThrottle.flush();

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

      const evaluateSafety = async (toolName: string, toolArgs: Record<string, any>) => {
        let isDestructive = false;
        let riskTier: 'low' | 'medium' | 'critical' = 'low';
        let destructiveProbability: number | undefined = undefined;
        let safetyRationale: string | undefined = undefined;

        if (toolName === 'run_shell' && toolArgs.command) {
          try {
            const verdict = await judgeCommandRisk(toolArgs.command);
            isDestructive = verdict.is_destructive || verdict.requires_approval;
            riskTier = verdict.risk_tier;
            destructiveProbability = verdict.destructive_probability;
            safetyRationale = verdict.rationale;
          } catch {
            try {
              isDestructive = await checkDestructiveCommand(toolArgs.command);
              riskTier = isDestructive ? 'critical' : 'low';
            } catch {
              isDestructive = true;
              riskTier = 'critical';
            }
          }
        } else if (toolName === 'gui_action') {
          isDestructive = isGuiActionDestructive(toolArgs);
          riskTier = isDestructive ? 'critical' : 'low';
          destructiveProbability = isDestructive ? 0.90 : 0.10;
          safetyRationale = isDestructive
            ? 'Desktop GUI action targets restricted OS control or non-allowlisted application'
            : 'Guarded GUI action on allowlisted application';
        } else if (toolName === 'write_file') {
          isDestructive = true;
          riskTier = 'medium';
          destructiveProbability = 0.35;
          safetyRationale = 'Writing or overwriting local file modifies filesystem state';
        }

        return { isDestructive, riskTier, destructiveProbability, safetyRationale };
      };

      // A. XML format: <tool_call name="..." args='...'> or <tool_call name="...">...</tool_call>
      let xmlMatch;
      const xmlRegex = new RegExp(XML_TOOL_CALL_REGEX.source, 'gi');
      while ((xmlMatch = xmlRegex.exec(rawStreamed)) !== null) {
        handledToolSignatures.add(xmlMatch[0]);
        const name = normalizeToolName(xmlMatch[1]);
        const argsStr = xmlMatch[2] || xmlMatch[3] || xmlMatch[4] || '{}';
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(argsStr.trim());
        } catch {
          args = { raw: argsStr.trim() };
        }

        const safety = await evaluateSafety(name, args);

        tools.push({
          id: crypto.randomUUID(),
          toolName: name,
          args,
          status: 'pending_approval',
          isDestructive: safety.isDestructive,
          riskTier: safety.riskTier,
          destructiveProbability: safety.destructiveProbability,
          safetyRationale: safety.safetyRationale,
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
            const name = normalizeToolName(String(parsed.name));
            const args = (parsed.arguments || parsed.parameters || parsed.args || {}) as Record<string, any>;
            const safety = await evaluateSafety(name, args);

            tools.push({
              id: crypto.randomUUID(),
              toolName: name,
              args,
              status: 'pending_approval',
              isDestructive: safety.isDestructive,
              riskTier: safety.riskTier,
              destructiveProbability: safety.destructiveProbability,
              safetyRationale: safety.safetyRationale,
            });
          }
        } catch {
          // not json, ignored
        }
      }

      // 10. Check for structured execution plans (<plan>...</plan>)
      let executionPlan: ExecutionPlan | null = null;
      const parsedPlanResult = parsePlanFromResponse(rawStreamed);
      if (parsedPlanResult.plan) {
        executionPlan = await classifyPlanSafety(parsedPlanResult.plan, async (cmd) => {
          try {
            const v = await judgeCommandRisk(cmd);
            return v.is_destructive || v.requires_approval;
          } catch {
            return checkDestructiveCommand(cmd);
          }
        });
        if (executionPlan) {
          executionPlan.status = 'running';
        }
      } else if (tools.length > 1) {

        // Automatically bundle multiple tools into a multi-step plan
        const steps = tools.map((t, idx) => ({
          id: t.id,
          stepNumber: idx + 1,
          description: `Execute ${t.toolName} (${t.args.command || t.args.path || JSON.stringify(t.args)})`,
          toolName: t.toolName,
          args: t.args,
          isDestructive: !!t.isDestructive,
          status: 'pending' as const,
        }));
        const hasDestructive = steps.some((s) => s.isDestructive);
        executionPlan = {
          id: crypto.randomUUID(),
          title: 'Multi-Step Execution Plan',
          steps,
          status: 'running',
          hasDestructiveSteps: hasDestructive,
          currentStepIndex: 0,
        };
      }

      const finalText = cleanDisplayContent(rawStreamed);

      const finalProviderInfo: ProviderBadgeInfo = {
        providerId: orchestrationResult.providerId,
        modelName: orchestrationResult.modelName,
        isLocal: orchestrationResult.isLocal,
        isPrivacyProtected: orchestrationResult.isLocal || memoriesWithheldCount > 0,
        memoriesWithheld: memoriesWithheldCount > 0 ? memoriesWithheldCount : undefined,
        recommendedRoute: orchestrationResult.recommendedRoute,
      };

      const displayContent =
        finalText ||
        (tools.length > 0 || executionPlan
          ? ''
          : cleanDisplayContent(rawStreamed));

      get().updateMessageContent(
        assistantId,
        displayContent,
        false,
        recalled,
        proposed,
        tools,
        finalProviderInfo,
        activeWinInfo,
        finalReasoning,
        executionPlan || undefined
      );

      // 11. Handle execution: auto-execute all tasks directly without waiting for manual approvals
      if (executionPlan) {
        get().executePlan(assistantId);
      } else if (tools.length > 0) {
        const SAFE_READ_TOOLS = new Set([
          'read_file',
          'list_directory',
          'search_files',
          'search_web',
          'searxng_search',
          'fetch_url',
          'browse_page',
          'extract_links',
          'search_memory',
          'read_clipboard',
          'open_target',
          'open_app',
          'simulate_key_press',
          'simulate_scroll',
          'inject_text',
          'math_evaluate',
          'math_solve',
          'set_system_volume',
          'get_system_volume',
          'play_spotify',
          'media_control',
          'lock_screen',
          'get_active_window',
        ]);

        const allowed = get().alwaysAllowedCommands;
        for (let i = 0; i < tools.length; i++) {
          const t = tools[i];
          const cmdKey = t.args.command;
          const scopedKey = `${t.toolName}:${cmdKey || t.args.path || t.args.target || 'default'}`;
          const isExplicitlyAllowed =
            (cmdKey && allowed.includes(cmdKey)) || allowed.includes(scopedKey);
          const isHandsFreeAutoApprove =
            options?.autoApproveSafeTools !== false &&
            !t.isDestructive &&
            (t.riskTier === 'low' || SAFE_READ_TOOLS.has(t.toolName));

          if (isHandsFreeAutoApprove || isExplicitlyAllowed) {
            get().approveToolExecution(assistantId, i);
          } else if (t.isDestructive || t.riskTier === 'critical') {
            showMainWindow().catch(() => {});
          }
        }
      }

      // Success: clear last failed prompt
      set({ lastFailedPrompt: null });
    } catch (err: unknown) {
      streamThrottle.flush();
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Failed to receive response from provider.';

      let actionableError = errorMsg;
      const isRateLimit =
        errorMsg.includes("used today's free messages") ||
        (err && typeof err === 'object' && (err as any).name === 'RateLimitError');

      if (isRateLimit) {
        actionableError =
          "You've used today's free messages — add your own API key for unlimited use, or wait until tomorrow.";
      } else if (
        errorMsg.includes('Failed to fetch') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('11434') ||
        errorMsg.includes('NetworkError') ||
        errorMsg.includes('unreachable')
      ) {
        if (providerInfo.providerId === 'bedrock') {
          actionableError =
            'AWS Bedrock connection failed in Sydney Region (ap-southeast-2). Please verify your AWS credentials or network connection in AWS Settings.';
        } else if (providerInfo.providerId === 'qwen-coder' || providerInfo.providerId === 'ollama') {
          actionableError =
            'Local AI inference engine (Ollama) is offline or unreachable on localhost:11434. Make sure Ollama is running (`ollama serve`).';
        } else {
          actionableError = `Network connection offline while connecting to ${providerInfo.providerId.toUpperCase()}.`;
        }
      }

      if (!rawStreamed) {
        get().updateMessageContent(
          assistantId,
          isRateLimit
            ? `**Daily Free Quota Reached**: ${actionableError}`
            : `**Connection Issue**: ${actionableError}`,
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
      if (slowNoticeTimer) clearTimeout(slowNoticeTimer);
      if (slowWarnTimer) clearTimeout(slowWarnTimer);
      set({ isLoading: false });
    }
  },

  inspectCurrentScreen: async (customPrompt?: string) => {
    set({ isLoading: true, error: null });
    const userPrompt = customPrompt?.trim() || 'What am I looking at right now?';

    try {
      playSystemEarcon('processing').catch(() => {});
      const screenData = await captureScreenData();
      let activeWinInfo: ActiveWindowInfo | undefined = undefined;
      try {
        activeWinInfo = await getActiveWindow();
      } catch {}

      get().addMessage({
        role: 'user',
        content: userPrompt,
        activeWindowContext: activeWinInfo,
        screenSnapshot: {
          base64: screenData.base64,
          width: screenData.width,
          height: screenData.height,
          filePath: screenData.filePath,
        },
      });

      const assistantId = get().addMessage({
        role: 'assistant',
        content: 'Analyzing visual screen layout and active window context...',
        isStreaming: true,
        activeWindowContext: activeWinInfo,
      });

      const result = await inspectActiveScreen(userPrompt, screenData);

      get().updateMessageContent(
        assistantId,
        result.analysis,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        activeWinInfo
      );

      playSystemEarcon('success').catch(() => {});
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      playSystemEarcon('error').catch(() => {});
      set({ error: `Visual screen inspection failed: ${errStr}` });
    } finally {
      set({ isLoading: false });
    }
  },
}));
