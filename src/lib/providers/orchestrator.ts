import { ChatOptions, LLMProvider, ProviderMessage } from './types';
import { geminiProvider } from './gemini';
import { claudeProvider } from './claude';
import { openAIProvider } from './openai';
import { qwenCoderProvider } from './qwenCoder';
import { aeioFreeProvider } from './aeioFree';
import { getApiKey } from '../ipc';
import { useSettingsStore } from '../../stores/settingsStore';

export type TaskType = 'code' | 'planning' | 'search_retrieval' | 'conversational';

export interface OrchestrationResult {
  content: string;
  providerId: string;
  modelName: string;
  isLocal: boolean;
  taskType: TaskType;
}

/**
 * Classifies a user prompt to determine optimal execution characteristics.
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
  const taskType = classifyUserTask(latestMessage);
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

  // 1. If task is coding/scripts: prefer Claude 3.5 Sonnet or Gemini 2.5/2.0 Flash
  if (taskType === 'code' || taskType === 'planning') {
    if (keys.claudeKey) {
      candidates.push({
        provider: claudeProvider,
        apiKey: keys.claudeKey,
        model: 'claude-3-5-sonnet-20241022',
        isLocal: false,
      });
    }
    if (keys.geminiKey) {
      candidates.push({
        provider: geminiProvider,
        apiKey: keys.geminiKey,
        model: 'gemini-2.0-flash',
        isLocal: false,
      });
    }
  } else {
    // Conversational or fast retrieval: prefer Gemini Flash for instant sub-second response
    if (keys.geminiKey) {
      candidates.push({
        provider: geminiProvider,
        apiKey: keys.geminiKey,
        model: 'gemini-2.0-flash',
        isLocal: false,
      });
    }
    if (keys.claudeKey) {
      candidates.push({
        provider: claudeProvider,
        apiKey: keys.claudeKey,
        model: 'claude-3-5-haiku-20241022',
        isLocal: false,
      });
    }
  }

  // OpenAI candidate if key available
  if (keys.openAIKey) {
    candidates.push({
      provider: openAIProvider,
      apiKey: keys.openAIKey,
      model: 'gpt-4o',
      isLocal: false,
    });
  }

  // Cloud Free proxy candidate
  candidates.push({
    provider: aeioFreeProvider,
    model: 'claude-3-5-haiku',
    isLocal: false,
  });

  // Local Qwen-Coder via Ollama (always available offline fallback)
  candidates.push({
    provider: qwenCoderProvider,
    model: settings.ollamaModel || 'qwen2.5-coder',
    isLocal: true,
  });

  let lastError: Error | null = null;

  // Try candidates in order with automatic failover
  for (const candidate of candidates) {
    try {
      const mergedOptions: ChatOptions = {
        ...options,
        apiKey: candidate.apiKey,
        model: candidate.model,
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
