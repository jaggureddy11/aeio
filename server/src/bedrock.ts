/**
 * AWS Bedrock Converse Engine for Aeio Backend.
 * Uses Web Crypto (crypto.subtle) for zero-dependency AWS SigV4 signing.
 */

export interface BedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface BedrockMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: Array<{ format: 'png' | 'jpeg' | 'gif' | 'webp'; base64: string }>;
}

export interface BedrockConverseOptions {
  modelId: string;
  messages: BedrockMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface BedrockConverseResult {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  stopReason?: string;
  modelId: string;
}

function toArrayBuffer(data: string | Uint8Array | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (typeof data === 'string') {
    const enc = new TextEncoder().encode(data);
    return enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength) as ArrayBuffer;
  }
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function sha256(data: string | Uint8Array): Promise<ArrayBuffer> {
  const buffer = toArrayBuffer(data);
  return crypto.subtle.digest('SHA-256', buffer);
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const keyBuf = toArrayBuffer(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const dataBuf = toArrayBuffer(data);
  return crypto.subtle.sign('HMAC', cryptoKey, dataBuf);
}

function formatDate(date: Date): { amzDate: string; dateStamp: string } {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  const dateStamp = `${year}${month}${day}`;
  const amzDate = `${dateStamp}T${hours}${minutes}${seconds}Z`;
  return { amzDate, dateStamp };
}

async function signRequest(
  method: string,
  urlStr: string,
  body: string,
  creds: BedrockCredentials
): Promise<Record<string, string>> {
  const date = new Date();
  const { amzDate, dateStamp } = formatDate(date);
  const parsedUrl = new URL(urlStr);
  const host = parsedUrl.host;
  const canonicalUri = parsedUrl.pathname || '/';

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    host,
    'x-amz-date': amzDate,
  };

  if (creds.sessionToken) {
    headers['x-amz-security-token'] = creds.sessionToken;
  }

  const sortedHeaderKeys = Object.keys(headers).map((k) => k.toLowerCase()).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => {
      const origKey = Object.keys(headers).find((h) => h.toLowerCase() === k) || k;
      const val = headers[origKey].trim().replace(/\s+/g, ' ');
      return `${k}:${val}\n`;
    })
    .join('');

  const signedHeaders = sortedHeaderKeys.join(';');
  const payloadHash = toHex(await sha256(body));

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const canonicalRequestHash = toHex(await sha256(canonicalRequest));
  const credentialScope = `${dateStamp}/${creds.region}/bedrock/aws4_request`;

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  // Derive signing key
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + creds.secretAccessKey), dateStamp);
  const kRegion = await hmacSha256(kDate, creds.region);
  const kService = await hmacSha256(kRegion, 'bedrock');
  const kSigning = await hmacSha256(kService, 'aws4_request');

  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return headers;
}

export async function invokeBedrockConverse(
  options: BedrockConverseOptions,
  creds: BedrockCredentials
): Promise<BedrockConverseResult> {
  const region = creds.region || 'ap-southeast-2';
  const modelId = options.modelId;

  // Separate conversation and system messages
  const systemPromptBlocks: Array<{ text: string }> = [];
  if (options.systemPrompt) {
    systemPromptBlocks.push({ text: options.systemPrompt });
  }

  for (const m of options.messages) {
    if (m.role === 'system' && m.content) {
      systemPromptBlocks.push({ text: m.content });
    }
  }

  const conversationMessages = options.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const contentBlocks: any[] = [];
      if (m.images && m.images.length > 0) {
        for (const img of m.images) {
          contentBlocks.push({
            image: {
              format: img.format || 'png',
              source: {
                bytes: img.base64.replace(/^data:image\/\w+;base64,/, ''),
              },
            },
          });
        }
      }
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

  const payload: Record<string, any> = {
    messages: conversationMessages,
    inferenceConfig: {
      maxTokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    },
  };

  if (options.topP !== undefined) {
    payload.inferenceConfig.topP = options.topP;
  }
  if (systemPromptBlocks.length > 0) {
    payload.system = systemPromptBlocks;
  }

  const payloadStr = JSON.stringify(payload);
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/converse`;

  const signedHeaders = await signRequest('POST', url, payloadStr, creds);

  const res = await fetch(url, {
    method: 'POST',
    headers: signedHeaders,
    body: payloadStr,
  });

  if (!res.ok) {
    const errorText = await res.text();
    let message = errorText;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.message || parsed.Message || errorText;
    } catch {}

    throw new Error(`AWS Bedrock error (${res.status}): ${message}`);
  }

  const data: any = await res.json();
  const textPieces: string[] = [];
  const content = data.output?.message?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.text) {
        textPieces.push(block.text);
      }
    }
  }

  return {
    text: textPieces.join(''),
    usage: data.usage ? {
      inputTokens: data.usage.inputTokens,
      outputTokens: data.usage.outputTokens,
      totalTokens: data.usage.totalTokens,
    } : undefined,
    stopReason: data.stopReason,
    modelId,
  };
}
