import { ChatOptions, LLMProvider, ProviderHealth, ProviderMessage } from './types';
import { signAwsRequest, SigV4Credentials } from './awsSigV4';
import { getApiKey } from '../ipc';
import { useSettingsStore } from '../../stores/settingsStore';

export const DEFAULT_BEDROCK_REGION = 'ap-southeast-2';
export const DEFAULT_BEDROCK_MODEL = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

export interface BedrockModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
}

export const BEDROCK_AVAILABLE_MODELS: BedrockModelOption[] = [
  {
    id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    name: 'Claude 3.5 Sonnet v2',
    provider: 'Anthropic',
    description: 'Most intelligent model for complex coding, reasoning, and agents',
  },
  {
    id: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
    name: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    description: 'Hybrid reasoning and frontier intelligence',
  },
  {
    id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    description: 'High speed, lightweight, and cost efficient',
  },
  {
    id: 'amazon.nova-pro-v1:0',
    name: 'Amazon Nova Pro',
    provider: 'Amazon',
    description: 'Flagship multimodal model with deep reasoning',
  },
  {
    id: 'amazon.nova-lite-v1:0',
    name: 'Amazon Nova Lite',
    provider: 'Amazon',
    description: 'Fast and cost-optimized for routine tasks',
  },
  {
    id: 'meta.llama3-3-70b-instruct-v1:0',
    name: 'Llama 3.3 70B',
    provider: 'Meta',
    description: 'State of the art open weights model hosted on AWS',
  },
];

export interface ResolvedBedrockCredentials extends SigV4Credentials {
  region: string;
}

/**
 * Resolves AWS Bedrock credentials from options, environment, keychain, or settings store.
 */
export async function resolveBedrockCredentials(
  options?: ChatOptions
): Promise<ResolvedBedrockCredentials> {
  const settings = useSettingsStore.getState();
  const configuredRegion = settings.bedrockRegion || DEFAULT_BEDROCK_REGION;

  // 1. Direct pass via options.apiKey (JSON or delimited)
  if (options?.apiKey) {
    try {
      const parsed = JSON.parse(options.apiKey);
      if (parsed.accessKeyId && parsed.secretAccessKey) {
        return {
          accessKeyId: parsed.accessKeyId,
          secretAccessKey: parsed.secretAccessKey,
          sessionToken: parsed.sessionToken,
          region: parsed.region || configuredRegion,
        };
      }
    } catch {
      if (options.apiKey.includes(':')) {
        const parts = options.apiKey.split(':');
        return {
          accessKeyId: parts[0],
          secretAccessKey: parts[1],
          sessionToken: parts[2] || undefined,
          region: configuredRegion,
        };
      }
    }
  }

  // 2. Fetch from secure OS Keychain via IPC
  let accessKeyId = '';
  let secretAccessKey = '';
  let sessionToken: string | undefined;

  try {
    const rawKey = await getApiKey('bedrock');
    if (rawKey && rawKey.trim()) {
      try {
        const parsed = JSON.parse(rawKey);
        accessKeyId = parsed.accessKeyId || '';
        secretAccessKey = parsed.secretAccessKey || '';
        sessionToken = parsed.sessionToken;
      } catch {
        if (rawKey.includes(':')) {
          const parts = rawKey.split(':');
          accessKeyId = parts[0];
          secretAccessKey = parts[1];
          sessionToken = parts[2];
        }
      }
    }
  } catch {}

  if (!accessKeyId) {
    try {
      accessKeyId = await getApiKey('bedrock_access_key');
    } catch {}
  }
  if (!secretAccessKey) {
    try {
      secretAccessKey = await getApiKey('bedrock_secret_key');
    } catch {}
  }
  if (!sessionToken) {
    try {
      sessionToken = await getApiKey('bedrock_session_token');
    } catch {}
  }

  return {
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    sessionToken: sessionToken?.trim() || undefined,
    region: configuredRegion,
  };
}

export class BedrockProvider implements LLMProvider {
  readonly id = 'bedrock';
  readonly name = 'AWS Bedrock';

  async checkHealth(options?: ChatOptions): Promise<ProviderHealth> {
    const creds = await resolveBedrockCredentials(options);
    if (!creds.accessKeyId || !creds.secretAccessKey) {
      return {
        ok: false,
        message: 'AWS Bedrock credentials not configured. Please add Access Key ID and Secret Access Key in Settings.',
      };
    }
    return {
      ok: true,
      installedModels: BEDROCK_AVAILABLE_MODELS.map((m) => m.id),
    };
  }

  async chat(messages: ProviderMessage[], options?: ChatOptions): Promise<string> {
    const creds = await resolveBedrockCredentials(options);
    if (!creds.accessKeyId || !creds.secretAccessKey) {
      throw new Error(
        'AWS Bedrock credentials missing. Please configure your AWS Access Key and Secret Key in Settings.'
      );
    }

    const modelId = options?.model || useSettingsStore.getState().bedrockModel || DEFAULT_BEDROCK_MODEL;
    const region = creds.region || DEFAULT_BEDROCK_REGION;

    // Separate system messages
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

    // Build system blocks
    const systemPromptBlocks: { text: string }[] = [];
    if (options?.systemPrompt) {
      systemPromptBlocks.push({ text: options.systemPrompt });
    }
    for (const sys of systemMessages) {
      if (sys.content) {
        systemPromptBlocks.push({ text: sys.content });
      }
    }

    // Format Bedrock Converse messages
    const formattedMessages = conversationMessages.map((m) => {
      const contentBlocks: any[] = [];

      // Add image blocks if provided
      if (m.images && m.images.length > 0) {
        for (const img of m.images) {
          let format: 'png' | 'jpeg' | 'gif' | 'webp' = 'png';
          if (img.startsWith('data:image/jpeg')) format = 'jpeg';
          else if (img.startsWith('data:image/webp')) format = 'webp';
          else if (img.startsWith('data:image/gif')) format = 'gif';

          const base64Bytes = img.replace(/^data:image\/\w+;base64,/, '');
          contentBlocks.push({
            image: {
              format,
              source: {
                bytes: base64Bytes,
              },
            },
          });
        }
      }

      // Add text content block
      if (m.content) {
        contentBlocks.push({ text: m.content });
      } else if (contentBlocks.length === 0) {
        contentBlocks.push({ text: ' ' });
      }

      return {
        role: m.role as 'user' | 'assistant',
        content: contentBlocks,
      };
    });

    const bodyObj: Record<string, any> = {
      messages: formattedMessages,
      inferenceConfig: {
        maxTokens: 4096,
        temperature: options?.temperature ?? 0.7,
      },
    };

    if (options?.topP !== undefined) {
      bodyObj.inferenceConfig.topP = options.topP;
    }
    if (systemPromptBlocks.length > 0) {
      bodyObj.system = systemPromptBlocks;
    }

    const payloadStr = JSON.stringify(bodyObj);

    // Bedrock Converse API endpoint
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/converse`;

    const signed = await signAwsRequest(
      {
        method: 'POST',
        url,
        service: 'bedrock',
        region,
        body: payloadStr,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
      },
      creds
    );

    let response: Response;
    try {
      response = await fetch(signed.url, {
        method: signed.method,
        headers: signed.headers,
        body: signed.body,
      });
    } catch (netErr: unknown) {
      const msg = netErr instanceof Error ? netErr.message : String(netErr);
      if (
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('ENOTFOUND')
      ) {
        throw new Error(
          `Network offline or AWS Bedrock unreachable in region ${region}. You can switch to local Ollama to continue offline.`
        );
      }
      throw netErr;
    }

    if (!response.ok) {
      const errText = await response.text();
      let parsedMessage = '';
      try {
        const parsed = JSON.parse(errText);
        parsedMessage = parsed.message || parsed.Message || parsed.error?.message || '';
      } catch {}

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `AWS Bedrock authentication error (HTTP ${response.status}): ${parsedMessage || 'Invalid credentials or missing bedrock:InvokeModel IAM permission.'}`
        );
      }
      if (response.status === 429) {
        throw new Error(
          `AWS Bedrock rate limit or quota exceeded (HTTP 429). Please check your AWS Service Quotas in region ${region}.`
        );
      }
      if (response.status === 404) {
        throw new Error(
          `Model ${modelId} not found or not enabled in AWS Bedrock (${region}). Please request model access in AWS Bedrock Console.`
        );
      }

      throw new Error(
        `AWS Bedrock API error (${response.status}): ${parsedMessage || errText || response.statusText}`
      );
    }

    const responseJson = await response.json();
    const outputMessage = responseJson.output?.message;
    const textPieces: string[] = [];

    if (outputMessage?.content && Array.isArray(outputMessage.content)) {
      for (const block of outputMessage.content) {
        if (block.text) {
          textPieces.push(block.text);
        }
      }
    }

    const fullText = textPieces.join('');

    // If caller requested streaming chunks, simulate progressive chunk delivery
    if (options?.onChunk && fullText) {
      const chunkSize = 64;
      for (let i = 0; i < fullText.length; i += chunkSize) {
        options.onChunk(fullText.slice(i, i + chunkSize));
      }
    }

    return fullText;
  }
}

export const bedrockProvider = new BedrockProvider();
