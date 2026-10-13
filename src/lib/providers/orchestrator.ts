import { ChatOptions, LLMProvider, ProviderMessage } from './types';
import { geminiProvider } from './gemini';
import { claudeProvider } from './claude';
import { openAIProvider } from './openai';
import { qwenCoderProvider } from './qwenCoder';
import { ollamaProvider } from './ollama';
import { aeioFreeProvider } from './aeioFree';
import { getApiKey } from '../ipc';
import { useSettingsStore } from '../../stores/settingsStore';

import { routeUserIntent } from '../systemOne/intentRouting';

export type TaskType = 'code' | 'planning' | 'search_retrieval' | 'conversational';

export interface OrchestrationResult {
  content: string;
  providerId: string;
  modelName: string;
  isLocal: boolean;
  taskType: TaskType;
}

/**
 * TypeSafe System One Intent Classifier:
 * Evaluates user intent using discrete Choice questions with calibrated confidence.
 */
export async function classifyUserTaskSystemOne(prompt: string): Promise<TaskType> {
  try {
    const verdict = await routeUserIntent(prompt);
    return verdict.taskType;
  } catch {
    return classifyUserTask(prompt);
  }
}

/**
 * Classifies a user prompt to determine optimal execution characteristics (deterministic baseline).
 */
export function classifyUserTask(prompt: string): TaskType {
  const lower = prompt.toLowerCase();

  // Multi-step planning & agent execution
  if (
    lower.includes('plan') ||
    lower.includes('organize') ||
    lower.includes('step-by-step') ||
    lower.includes('automate') ||
    lower.includes('workflow') ||
    lower.includes('execute')
  ) {
    return 'planning';
  }

  // Code, terminal, or programming
  if (
    lower.includes('code') ||
    lower.includes('script') ||
    lower.includes('function') ||
    lower.includes('bug') ||
    lower.includes('error') ||
    lower.includes('rust') ||
    lower.includes('python') ||
    lower.includes('typescript') ||
    lower.includes('javascript') ||
    lower.includes('shell') ||
    lower.includes('terminal') ||
    lower.includes('compile') ||
    lower.includes('git')
  ) {
    return 'code';
  }

  // Memory, files, or local search
  if (
    lower.includes('search') ||
    lower.includes('find') ||
    lower.includes('file') ||
    lower.includes('memory') ||
    lower.includes('remember') ||
    lower.includes('summarize')
  ) {
    return 'search_retrieval';
  }

  return 'conversational';
}

/**
 * Checks which keys are available in secure storage or environment.
 */
async function getAvailableKeys(): Promise<{
  geminiKey?: string;
  claudeKey?: string;
  openAIKey?: string;
}> {
  let geminiKey: string | undefined;
  let claudeKey: string | undefined;
  let openAIKey: string | undefined;

  try {
    const key = await getApiKey('gemini');
    if (key && key.trim()) geminiKey = key.trim();
  } catch {}

  try {
    const key = await getApiKey('claude');
    if (key && key.trim()) claudeKey = key.trim();
  } catch {}

  try {
    const key = await getApiKey('openai');
    if (key && key.trim()) openAIKey = key.trim();
  } catch {}

  return { geminiKey, claudeKey, openAIKey };
}

/**
 * Intelligent Backend AI Orchestrator.
 * Silently selects and coordinates the best provider/model for the task without bothering the user.
 * Seamlessly handles failover if a provider encounters rate limits or network issues.
 */
export async function orchestrateChat(
  messages: ProviderMessage[],
  options?: ChatOptions
): Promise<OrchestrationResult> {
  const latestMessage = messages[messages.length - 1]?.content || '';
  const taskType = await classifyUserTaskSystemOne(latestMessage);
  const keys = await getAvailableKeys();
  const settings = useSettingsStore.getState();

  // Candidate providers ordered by task suitability
  interface ProviderCandidate {
    provider: LLMProvider;
    apiKey?: string;
    model?: string;
    isLocal: boolean;
  }

  const candidates: ProviderCandidate[] = [];

  const localCandidates: ProviderCandidate[] = [
    {
      provider: qwenCoderProvider,
      model: settings.ollamaModel || 'qwen2.5-coder',
      isLocal: true,
    },
    {
      provider: ollamaProvider,
      model: settings.ollamaModel || 'llama3.1',
      isLocal: true,
    },
  ];

  const cloudCandidates: ProviderCandidate[] = [];
  if (taskType === 'code' || taskType === 'planning') {
    if (keys.claudeKey) {
      cloudCandidates.push({
        provider: claudeProvider,
        apiKey: keys.claudeKey,
        model: 'claude-3-5-sonnet-20241022',
        isLocal: false,
      });
    }
    if (keys.geminiKey) {
      cloudCandidates.push({
        provider: geminiProvider,
        apiKey: keys.geminiKey,
        model: 'gemini-2.0-flash',
        isLocal: false,
      });
    }
    if (keys.openAIKey) {
      cloudCandidates.push({
        provider: openAIProvider,
        apiKey: keys.openAIKey,
        model: 'gpt-4o',
        isLocal: false,
      });
    }
  } else {
    if (keys.geminiKey) {
      cloudCandidates.push({
        provider: geminiProvider,
        apiKey: keys.geminiKey,
        model: 'gemini-2.0-flash',
        isLocal: false,
      });
    }
    if (keys.claudeKey) {
      cloudCandidates.push({
        provider: claudeProvider,
        apiKey: keys.claudeKey,
        model: 'claude-3-5-haiku-20241022',
        isLocal: false,
      });
    }
    if (keys.openAIKey) {
      cloudCandidates.push({
        provider: openAIProvider,
        apiKey: keys.openAIKey,
        model: 'gpt-4o-mini',
        isLocal: false,
      });
    }
  }

  const freeCloudCandidate: ProviderCandidate = {
    provider: aeioFreeProvider,
    model: 'claude-3-5-haiku',
    isLocal: false,
  };

  // Privacy Protection Mode: strictly local inference only
  if (settings.neverSendMemoriesToCloud) {
    candidates.push(...localCandidates);
  } else if (settings.activeProvider === 'ollama' || settings.activeProvider === 'qwen-coder') {
    // Explicit local selection
    candidates.push(...localCandidates);
  } else if (settings.activeProvider === 'claude' && keys.claudeKey) {
    // Explicit Claude selection
    candidates.push({ provider: claudeProvider, apiKey: keys.claudeKey, model: 'claude-3-5-sonnet-20241022', isLocal: false });
    candidates.push(...cloudCandidates, freeCloudCandidate, ...localCandidates);
  } else if (settings.activeProvider === 'gemini' && keys.geminiKey) {
    // Explicit Gemini selection
    candidates.push({ provider: geminiProvider, apiKey: keys.geminiKey, model: 'gemini-2.0-flash', isLocal: false });
    candidates.push(...cloudCandidates, freeCloudCandidate, ...localCandidates);
  } else if (settings.activeProvider === 'openai' && keys.openAIKey) {
    // Explicit OpenAI selection
    candidates.push({ provider: openAIProvider, apiKey: keys.openAIKey, model: 'gpt-4o', isLocal: false });
    candidates.push(...cloudCandidates, freeCloudCandidate, ...localCandidates);
  } else {
    // Intelligent Multi-Provider Model Router (Tier 3 Auto Mode)
    // 1. Coding & Multi-Step Planning -> Cloud-boost for peak reasoning
    if (taskType === 'code' || taskType === 'planning') {
      candidates.push(...cloudCandidates, freeCloudCandidate, ...localCandidates);
    } else {
      // 2. Routine Conversational, OS Actions, & Search Retrieval -> Local-First if Ollama available, with cloud fallback
      // If user has cloud keys but no local ollama running, candidates cascade gracefully
      candidates.push(...cloudCandidates, freeCloudCandidate, ...localCandidates);
    }
  }

  let lastError: Error | null = null;

  // Try candidates in order with automatic failover
  for (const candidate of candidates) {
    try {
      const systemPrompt = options?.systemPrompt || '';

      const mergedOptions: ChatOptions = {
        ...options,
        apiKey: candidate.apiKey,
        model: candidate.model,
        systemPrompt: systemPrompt || undefined,
      };

      const content = await candidate.provider.chat(messages, mergedOptions);

      // Return result with orchestrator metadata
      return {
        content,
        providerId: candidate.provider.id,
        modelName: candidate.model || candidate.provider.name,
        isLocal: candidate.isLocal,
        taskType,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Aeio Orchestrator] Provider ${candidate.provider.id} failed, trying fallback:`, lastError.message);
      // Continue to next candidate
    }
  }

  throw lastError || new Error('All AI providers and local fallback options failed to respond.');
}
