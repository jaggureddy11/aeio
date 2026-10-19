import { ChatOptions, LLMProvider, ProviderHealth, ProviderMessage } from './types';
import { signAwsRequest, SigV4Credentials } from './awsSigV4';
import { getApiKey } from '../ipc';
import { useSettingsStore } from '../../stores/settingsStore';

export const DEFAULT_BEDROCK_REGION = 'ap-southeast-2';
export const DEFAULT_BEDROCK_MODEL = 'amazon.nova-lite-v1:0';

export interface BedrockModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
}

export const BEDROCK_AVAILABLE_MODELS: BedrockModelOption[] = [
  {
    id: 'amazon.nova-lite-v1:0',
    name: 'Amazon Nova Lite',
    provider: 'Amazon',
    description: 'Blazing fast (250ms), cost-effective intelligence in Sydney Region (Recommended)',
  },
  {
    id: 'amazon.nova-pro-v1:0',
    name: 'Amazon Nova Pro',
    provider: 'Amazon',
    description: 'Flagship multimodal reasoning and complex problem solving in Sydney Region',
  },
  {
    id: 'amazon.nova-micro-v1:0',
    name: 'Amazon Nova Micro',
    provider: 'Amazon',
    description: 'Ultra-lightweight instant responses (200ms) with minimal latency',
  },
  {
    id: 'apac.amazon.nova-lite-v1:0',
    name: 'Amazon Nova Lite (APAC Router)',
    provider: 'Amazon',
    description: 'Cross-zone resilience with APAC regional router',
  },
  {
    id: 'apac.amazon.nova-pro-v1:0',
    name: 'Amazon Nova Pro (APAC Router)',
    provider: 'Amazon',
    description: 'Cross-zone high-performance reasoning with APAC regional router',
  },
  {
    id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    name: 'Claude 3.5 Sonnet v2',
    provider: 'Anthropic',
    description: 'Frontier Anthropic model (requires Bedrock model access grant in AWS Console)',
  },
  {
    id: 'meta.llama3-3-70b-instruct-v1:0',
    name: 'Llama 3.3 70B',
    provider: 'Meta',
    description: 'State of the art open weights model hosted on AWS Bedrock',
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
        if (parts[0] && parts[1]) {
          return {
            accessKeyId: parts[0],
            secretAccessKey: parts[1],
            sessionToken: parts[2] || undefined,
            region: configuredRegion,
          };
        }
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

  // 3. Browser preview fallback via localStorage
  if (!accessKeyId || !secretAccessKey) {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('aeio_bedrock_credentials') || localStorage.getItem('aeio_key_bedrock');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.expiration && new Date(parsed.expiration).getTime() <= Date.now()) {
              localStorage.removeItem('aeio_bedrock_credentials');
            } else if (parsed.accessKeyId && parsed.secretAccessKey) {
              accessKeyId = parsed.accessKeyId;
              secretAccessKey = parsed.secretAccessKey;
              if (parsed.sessionToken) sessionToken = parsed.sessionToken;
            }
          } catch {
            if (stored.includes(':')) {
              const parts = stored.split(':');
              accessKeyId = parts[0];
              secretAccessKey = parts[1];
              if (parts[2]) sessionToken = parts[2];
            }
          }
        }
      }
    } catch {}
  }

  // 4. Local dev server auto-export fallback when running in browser mode, or process.env when in Node
  if (!accessKeyId || !secretAccessKey) {
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      try {
        const resp = await fetch('/api/aws-credentials');
        if (resp.ok) {
          const data = await resp.json();
          if (data.accessKeyId && data.secretAccessKey) {
            accessKeyId = data.accessKeyId;
            secretAccessKey = data.secretAccessKey;
            if (data.sessionToken) sessionToken = data.sessionToken;
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('aeio_bedrock_credentials', JSON.stringify(data));
            }
          }
        }
      } catch {}
    } else {
      const nodeEnv = (globalThis as any).process?.env;
      if (nodeEnv?.AWS_ACCESS_KEY_ID && nodeEnv?.AWS_SECRET_ACCESS_KEY) {
        accessKeyId = nodeEnv.AWS_ACCESS_KEY_ID;
        secretAccessKey = nodeEnv.AWS_SECRET_ACCESS_KEY;
        sessionToken = nodeEnv.AWS_SESSION_TOKEN;
      }
    }
  }

  return {
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    sessionToken: sessionToken?.trim() || undefined,
    region: configuredRegion,
  };
}

/**
 * Decodes AWS Bedrock ConverseStream event stream binary frames.
 */
export function parseBedrockEventStreamFrames(
  buffer: Uint8Array,
  onChunk?: (text: string) => void
): { remaining: Uint8Array; textDeltas: string[] } {
  let offset = 0;
  const textDeltas: string[] = [];
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  while (offset + 16 <= buffer.length) {
    const totalLength = view.getUint32(offset, false);
    const headersLength = view.getUint32(offset + 4, false);

    // Frame incomplete or invalid
    if (totalLength < 16 || offset + totalLength > buffer.length) {
      break;
    }

    const payloadOffset = offset + 12 + headersLength;
    const payloadLength = totalLength - 12 - headersLength - 4;

    if (payloadLength > 0 && payloadOffset + payloadLength <= offset + totalLength) {
      const payloadBytes = buffer.slice(payloadOffset, payloadOffset + payloadLength);
      try {
        const text = new TextDecoder('utf-8').decode(payloadBytes);
        const data = JSON.parse(text);
        const delta =
          data.delta?.text ||
          data.contentBlockDelta?.delta?.text ||
          data.text ||
          '';
        if (delta) {
          textDeltas.push(delta);
          onChunk?.(delta);
        }
      } catch {
        // Skip non-JSON or control frames (e.g. metadata, messageStart, messageStop)
      }
    }

    offset += totalLength;
  }

  return {
    remaining: buffer.slice(offset),
    textDeltas,
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
        maxTokens: options?.maxTokens ?? 2048,
        temperature: options?.temperature ?? 0.3,
      },
    };

    if (options?.topP !== undefined) {
      bodyObj.inferenceConfig.topP = options.topP;
    }
    // Prompt Caching (aws-samples/amazon-bedrock-samples)
    // Caches static system prompt and context to reduce TTFT latency by up to 80% on Claude 3/3.5 models.
    const supportsPromptCache = modelId.includes('claude-3') || modelId.includes('nova');
    if (supportsPromptCache && systemPromptBlocks.length > 0) {
      const lastIdx = systemPromptBlocks.length - 1;
      (systemPromptBlocks[lastIdx] as any).cachePoint = { type: 'default' };
    }

    if (systemPromptBlocks.length > 0) {
      bodyObj.system = systemPromptBlocks;
    }

    let payloadStr = JSON.stringify(bodyObj);

    // Bedrock Converse / ConverseStream API endpoint (aws-samples/sample-bedrock-converse-api)
    let isStreamingRequested = Boolean(options?.onChunk);
    let endpoint = isStreamingRequested ? 'converse-stream' : 'converse';
    let url = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/${endpoint}`;

    let signed = await signAwsRequest(
      {
        method: 'POST',
        url,
        service: 'bedrock',
        region,
        body: payloadStr,
        headers: {
          'content-type': 'application/json',
          accept: isStreamingRequested
            ? 'application/vnd.amazon.eventstream, application/json'
            : 'application/json',
        },
      },
      creds
    );

    let fetchHeaders: Record<string, string> = { ...signed.headers };
    let requestUrl = signed.url;

    // In web browser dev mode, proxy through Vite dev server to bypass browser CORS headers
    if (typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)) {
      fetchHeaders['x-bedrock-target-url'] = signed.url;
      delete fetchHeaders['host'];
      delete fetchHeaders['Host'];
      requestUrl = '/api/bedrock-proxy';
    } else if (typeof window !== 'undefined') {
      delete fetchHeaders['host'];
      delete fetchHeaders['Host'];
    }

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: signed.method,
        headers: fetchHeaders,
        body: signed.body,
      });

      // If prompt caching returned a 400 validation error, retry immediately without cachePoint
      if (!response.ok && response.status === 400 && payloadStr.includes('"cachePoint"')) {
        for (const block of systemPromptBlocks) {
          delete (block as any).cachePoint;
        }
        bodyObj.system = systemPromptBlocks;
        payloadStr = JSON.stringify(bodyObj);

        signed = await signAwsRequest(
          {
            method: 'POST',
            url,
            service: 'bedrock',
            region,
            body: payloadStr,
            headers: {
              'content-type': 'application/json',
              accept: isStreamingRequested
                ? 'application/vnd.amazon.eventstream, application/json'
                : 'application/json',
            },
          },
          creds
        );
        fetchHeaders = { ...signed.headers };
        requestUrl = signed.url;
        if (typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)) {
          fetchHeaders['x-bedrock-target-url'] = signed.url;
          delete fetchHeaders['host'];
          delete fetchHeaders['Host'];
          requestUrl = '/api/bedrock-proxy';
        } else if (typeof window !== 'undefined') {
          delete fetchHeaders['host'];
          delete fetchHeaders['Host'];
        }
        response = await fetch(requestUrl, {
          method: signed.method,
          headers: fetchHeaders,
          body: signed.body,
        });
      }

      // If converse-stream returned 404 or 400, retry once using standard /converse endpoint
      if (!response.ok && isStreamingRequested && (response.status === 404 || response.status === 400)) {
        isStreamingRequested = false;
        endpoint = 'converse';
        url = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/${endpoint}`;
        signed = await signAwsRequest(
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
        fetchHeaders = { ...signed.headers };
        requestUrl = signed.url;
        if (typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)) {
          fetchHeaders['x-bedrock-target-url'] = signed.url;
          delete fetchHeaders['host'];
          delete fetchHeaders['Host'];
          requestUrl = '/api/bedrock-proxy';
        } else if (typeof window !== 'undefined') {
          delete fetchHeaders['host'];
          delete fetchHeaders['Host'];
        }
        response = await fetch(requestUrl, {
          method: signed.method,
          headers: fetchHeaders,
          body: signed.body,
        });
      }
    } catch (netErr: unknown) {
      const msg = netErr instanceof Error ? netErr.message : String(netErr);
      if (
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('ENOTFOUND')
      ) {
        throw new Error(
          `Network offline or AWS Bedrock unreachable in selected Region (${region}). Please check your connection or AWS Settings.`
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
        const isExpired =
          parsedMessage.toLowerCase().includes('expired') ||
          errText.toLowerCase().includes('expired') ||
          parsedMessage.toLowerCase().includes('security token');

        if (isExpired && typeof window !== 'undefined' && typeof fetch !== 'undefined' && !options?._isCredentialRetry) {
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem('aeio_bedrock_credentials');
            }
            const refreshResp = await fetch('/api/aws-credentials');
            if (refreshResp.ok) {
              const freshCreds = await refreshResp.json();
              if (freshCreds.accessKeyId && freshCreds.secretAccessKey) {
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem('aeio_bedrock_credentials', JSON.stringify(freshCreds));
                }
                return this.chat(messages, {
                  ...options,
                  _isCredentialRetry: true,
                  apiKey: JSON.stringify(freshCreds),
                });
              }
            }
          } catch {}
        }

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

    const contentType = response.headers?.get?.('content-type') || '';
    if (contentType.includes('eventstream') && response.body && typeof (response.body as any).getReader === 'function') {
      const reader = (response.body as any).getReader();
      let streamBuffer = new Uint8Array(0);
      const pieces: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length > 0) {
          const merged = new Uint8Array(streamBuffer.length + value.length);
          merged.set(streamBuffer);
          merged.set(value, streamBuffer.length);
          const parsed = parseBedrockEventStreamFrames(merged, options?.onChunk);
          streamBuffer = new Uint8Array(parsed.remaining);
          pieces.push(...parsed.textDeltas);
        }
      }

      return pieces.join('');
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
      const chunkSize = 32;
      for (let i = 0; i < fullText.length; i += chunkSize) {
        options.onChunk(fullText.slice(i, i + chunkSize));
      }
    }

    return fullText;
  }
}

export const bedrockProvider = new BedrockProvider();
