import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BedrockProvider, BEDROCK_AVAILABLE_MODELS } from '../lib/providers/bedrock';
import { getProvider } from '../lib/providers/providerRegistry';

describe('BedrockProvider', () => {
  let provider: BedrockProvider;

  beforeEach(() => {
    provider = new BedrockProvider();
    vi.restoreAllMocks();
  });

  it('is registered in providerRegistry with id "bedrock"', () => {
    const resolved = getProvider('bedrock');
    expect(resolved).toBeDefined();
    expect(resolved.id).toBe('bedrock');
    expect(resolved.name).toBe('AWS Bedrock');
  });

  it('fails health check if credentials are not configured', async () => {
    const health = await provider.checkHealth();
    expect(health.ok).toBe(false);
    expect(health.message).toContain('AWS Bedrock credentials not configured');
  });

  it('passes health check when API credentials are provided', async () => {
    const health = await provider.checkHealth({
      apiKey: JSON.stringify({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      }),
    });
    expect(health.ok).toBe(true);
    expect(health.installedModels).toEqual(BEDROCK_AVAILABLE_MODELS.map((m) => m.id));
  });

  it('throws an informative error if credentials are missing during chat', async () => {
    await expect(
      provider.chat([{ role: 'user', content: 'Hello' }])
    ).rejects.toThrow('AWS Bedrock credentials missing');
  });

  it('formats payload and parses successful Converse response', async () => {
    const mockResponse = {
      output: {
        message: {
          role: 'assistant',
          content: [
            { text: 'Hello! I am Claude 3.5 Sonnet on AWS Bedrock.' },
          ],
        },
      },
      stopReason: 'end_turn',
      usage: {
        inputTokens: 10,
        outputTokens: 15,
        totalTokens: 25,
      },
    };

    let capturedUrl = '';
    let capturedMethod = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';

    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init.method;
      capturedHeaders = init.headers;
      capturedBody = init.body;

      return {
        ok: true,
        status: 200,
        json: async () => mockResponse,
      };
    });

    const chunks: string[] = [];
    const result = await provider.chat(
      [
        { role: 'system', content: 'You are Aeio assistant.' },
        { role: 'user', content: 'What models are on Bedrock?' },
      ],
      {
        apiKey: JSON.stringify({
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          region: 'ap-southeast-2',
        }),
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        onChunk: (chunk) => chunks.push(chunk),
      }
    );

    expect(result).toBe('Hello! I am Claude 3.5 Sonnet on AWS Bedrock.');
    expect(chunks.join('')).toBe(result);
    expect(capturedUrl).toContain('bedrock-runtime.ap-southeast-2.amazonaws.com');
    expect(capturedUrl).toContain('anthropic.claude-3-5-sonnet-20241022-v2:0/converse');
    expect(capturedMethod).toBe('POST');
    expect(capturedHeaders['Authorization']).toContain('AWS4-HMAC-SHA256');
    expect(capturedHeaders['host']).toBe('bedrock-runtime.ap-southeast-2.amazonaws.com');

    const parsedBody = JSON.parse(capturedBody);
    expect(parsedBody.messages).toHaveLength(1);
    expect(parsedBody.messages[0].role).toBe('user');
    expect(parsedBody.messages[0].content[0].text).toBe('What models are on Bedrock?');
    expect(parsedBody.system[0].text).toBe('You are Aeio assistant.');
  });

  it('handles image multimodal inputs correctly', async () => {
    let capturedBody = '';
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = init.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output: {
            message: {
              role: 'assistant',
              content: [{ text: 'I see your screenshot.' }],
            },
          },
        }),
      };
    });

    const result = await provider.chat(
      [
        {
          role: 'user',
          content: 'Analyze this image',
          images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='],
        },
      ],
      {
        apiKey: 'AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      }
    );

    expect(result).toBe('I see your screenshot.');
    const parsed = JSON.parse(capturedBody);
    const contentBlocks = parsed.messages[0].content;
    expect(contentBlocks).toHaveLength(2);
    expect(contentBlocks[0].image.format).toBe('png');
    expect(contentBlocks[0].image.source.bytes).toBeDefined();
    expect(contentBlocks[1].text).toBe('Analyze this image');
  });

  it('handles 403 authorization error with actionable guidance', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => JSON.stringify({ message: 'User is not authorized to perform: bedrock:InvokeModel' }),
    });

    await expect(
      provider.chat([{ role: 'user', content: 'test' }], {
        apiKey: 'AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      })
    ).rejects.toThrow('AWS Bedrock authentication error (HTTP 403)');
  });

  it('handles 429 quota/throttle error with guidance', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => JSON.stringify({ message: 'Too Many Requests' }),
    });

    await expect(
      provider.chat([{ role: 'user', content: 'test' }], {
        apiKey: 'AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      })
    ).rejects.toThrow('rate limit or quota exceeded (HTTP 429)');
  });
});
