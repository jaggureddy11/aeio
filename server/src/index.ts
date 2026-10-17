import { invokeBedrockConverse, BedrockCredentials } from './bedrock';
import { generateAgentPlan, generateAgentStep } from './agentEndpoints';

export interface RateLimiterBinding {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
}

export interface Env {
  // AWS Bedrock Configuration
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
  BEDROCK_MODEL?: string;

  // Optional Fallbacks & Quotas
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  AEIO_KV?: KVNamespace;
  RATE_LIMITER?: RateLimiterBinding;
  DAILY_MESSAGE_CAP?: string;
  DAILY_IP_CAP?: string;
  DEFAULT_MODEL?: string;
}

export interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: Array<{ format: 'png' | 'jpeg' | 'gif' | 'webp'; base64: string }>;
}

export interface ChatPayload {
  messages: ProviderMessage[];
  systemPrompt?: string;
  model?: string;
  stream?: boolean;
}

// In-memory fallback cache for development / test suites when KV binding is not provisioned
export const inMemoryRateLimitStore = new Map<string, number>();

export function getRateLimitKey(installationId: string, customDateStr?: string): string {
  const dateStr = customDateStr || new Date().toISOString().slice(0, 10);
  return `ratelimit:${installationId}:${dateStr}`;
}

export function getIpRateLimitKey(clientIp: string, customDateStr?: string): string {
  const dateStr = customDateStr || new Date().toISOString().slice(0, 10);
  return `ratelimit:ip:${clientIp}:${dateStr}`;
}

export function getResetTimestamp(): string {
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  return tomorrow.toISOString();
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Installation-Id, Authorization',
};

export async function getRequestCount(env: Env, key: string): Promise<number> {
  if (env.AEIO_KV) {
    const raw = await env.AEIO_KV.get(key);
    return raw ? parseInt(raw, 10) : 0;
  }
  return inMemoryRateLimitStore.get(key) || 0;
}

export async function incrementRequestCount(env: Env, key: string, current: number): Promise<number> {
  const next = current + 1;
  if (env.AEIO_KV) {
    // 48 hours retention for automatic cleanup
    await env.AEIO_KV.put(key, String(next), { expirationTtl: 172800 });
  } else {
    inMemoryRateLimitStore.set(key, next);
  }
  return next;
}

export const AVAILABLE_BACKEND_MODELS = [
  {
    id: 'amazon.nova-pro-v1:0',
    name: 'Amazon Nova Pro',
    provider: 'Amazon',
    description: 'Flagship multimodal foundation model on AWS Bedrock with deep reasoning',
  },
  {
    id: 'amazon.nova-lite-v1:0',
    name: 'Amazon Nova Lite',
    provider: 'Amazon',
    description: 'High speed, cost-effective multimodal model for routine agent actions',
  },
  {
    id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    name: 'Claude 3.5 Sonnet v2',
    provider: 'Anthropic',
    description: 'Frontier reasoning and coding intelligence on AWS Bedrock',
  },
  {
    id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    description: 'Next-generation Claude Sonnet on AWS Bedrock',
  },
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // 2. Health & Status Check
    if (url.pathname === '/' || url.pathname === '/health') {
      const cap = parseInt(env.DAILY_MESSAGE_CAP || '30', 10);
      const isBedrockConfigured = !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) || !!env.AWS_REGION;
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'aeio-free-proxy',
          version: '2.0.0',
          dailyCap: cap,
          backendProvider: isBedrockConfigured ? 'aws-bedrock' : 'anthropic-proxy',
          region: env.AWS_REGION || 'ap-southeast-2',
          defaultModel: env.BEDROCK_MODEL || env.DEFAULT_MODEL || 'amazon.nova-pro-v1:0',
          endpoints: ['/v1/chat', '/v1/agent/plan', '/v1/agent/step', '/v1/models'],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Models Catalog
    if (url.pathname === '/v1/models') {
      return new Response(
        JSON.stringify({
          models: AVAILABLE_BACKEND_MODELS,
          region: env.AWS_REGION || 'ap-southeast-2',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Common Rate Limiter & Identity Validation for Protected Endpoints
    const isProtectedEndpoint =
      url.pathname === '/v1/chat' ||
      url.pathname === '/v1/agent/plan' ||
      url.pathname === '/v1/agent/step';

    if (isProtectedEndpoint) {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const clientIp =
        request.headers.get('cf-connecting-ip')?.trim() ||
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        '127.0.0.1';

      if (env.RATE_LIMITER) {
        try {
          const { success } = await env.RATE_LIMITER.limit({ key: clientIp });
          if (!success) {
            return new Response(
              JSON.stringify({
                error: 'burst_rate_limit_exceeded',
                message: 'Too many requests sent in a short window. Please wait a moment before sending more.',
              }),
              {
                status: 429,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }
        } catch {}
      }

      const installationId = request.headers.get('X-Installation-Id')?.trim();
      if (!installationId) {
        return new Response(
          JSON.stringify({
            error: 'missing_installation_id',
            message: 'Missing required X-Installation-Id header. Each client must send an anonymous installation ID.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const ipCap = parseInt(env.DAILY_IP_CAP || '50', 10);
      const ipRateLimitKey = getIpRateLimitKey(clientIp);
      const currentIpCount = await getRequestCount(env, ipRateLimitKey);

      if (currentIpCount >= ipCap) {
        const resetAt = getResetTimestamp();
        return new Response(
          JSON.stringify({
            error: 'ip_rate_limit_exceeded',
            message:
              'Too many requests from this network today — add your own API key for unlimited use, or wait until tomorrow.',
            limit: ipCap,
            remaining: 0,
            resetAt,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': String(ipCap),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': resetAt,
            },
          }
        );
      }

      const cap = parseInt(env.DAILY_MESSAGE_CAP || '30', 10);
      const rateLimitKey = getRateLimitKey(installationId);
      const currentCount = await getRequestCount(env, rateLimitKey);

      if (currentCount >= cap) {
        const resetAt = getResetTimestamp();
        return new Response(
          JSON.stringify({
            error: 'rate_limit_exceeded',
            message:
              "You've used today's free messages — add your own API key for unlimited use, or wait until tomorrow.",
            limit: cap,
            remaining: 0,
            resetAt,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': String(cap),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': resetAt,
            },
          }
        );
      }

      // Check if backend has any credentials configured (AWS Bedrock OR Anthropic)
      const hasBedrock = !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
      const hasAnthropic = !!env.ANTHROPIC_API_KEY;

      if (!hasBedrock && !hasAnthropic) {
        return new Response(
          JSON.stringify({
            error: 'backend_unconfigured',
            message: 'Hosted proxy server is missing backend credentials. Configure AWS credentials or ANTHROPIC_API_KEY.',
          }),
          {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Parse JSON Payload
      let body: any;
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'invalid_json', message: 'Request body must be valid JSON.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // === Route 1: Autonomous Agent Plan (/v1/agent/plan) ===
      if (url.pathname === '/v1/agent/plan') {
        if (!body.goal || typeof body.goal !== 'string') {
          return new Response(
            JSON.stringify({ error: 'invalid_goal', message: 'Field "goal" string is required.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (hasBedrock) {
          const creds: BedrockCredentials = {
            accessKeyId: env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
            sessionToken: env.AWS_SESSION_TOKEN,
            region: env.AWS_REGION || 'ap-southeast-2',
          };
          try {
            const planResult = await generateAgentPlan(
              body,
              creds,
              env.BEDROCK_MODEL || 'amazon.nova-pro-v1:0'
            );
            await incrementRequestCount(env, rateLimitKey, currentCount);
            await incrementRequestCount(env, ipRateLimitKey, currentIpCount);
            return new Response(JSON.stringify(planResult), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return new Response(JSON.stringify({ error: 'bedrock_error', message: msg }), {
              status: 502,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }

      // === Route 2: Autonomous Agent Next Step (/v1/agent/step) ===
      if (url.pathname === '/v1/agent/step') {
        if (!body.goal || typeof body.goal !== 'string') {
          return new Response(
            JSON.stringify({ error: 'invalid_goal', message: 'Field "goal" string is required.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (hasBedrock) {
          const creds: BedrockCredentials = {
            accessKeyId: env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
            sessionToken: env.AWS_SESSION_TOKEN,
            region: env.AWS_REGION || 'ap-southeast-2',
          };
          try {
            const stepResult = await generateAgentStep(
              body,
              creds,
              env.BEDROCK_MODEL || 'amazon.nova-pro-v1:0'
            );
            await incrementRequestCount(env, rateLimitKey, currentCount);
            await incrementRequestCount(env, ipRateLimitKey, currentIpCount);
            return new Response(JSON.stringify(stepResult), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return new Response(JSON.stringify({ error: 'bedrock_error', message: msg }), {
              status: 502,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }

      // === Route 3: Chat Proxy Endpoint (/v1/chat) ===
      if (url.pathname === '/v1/chat') {
        if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
          return new Response(
            JSON.stringify({ error: 'invalid_messages', message: 'Field "messages" array is required.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Priority A: AWS Bedrock if configured
        if (hasBedrock) {
          const creds: BedrockCredentials = {
            accessKeyId: env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
            sessionToken: env.AWS_SESSION_TOKEN,
            region: env.AWS_REGION || 'ap-southeast-2',
          };

          const targetModel =
            body.model || env.BEDROCK_MODEL || 'amazon.nova-pro-v1:0';

          try {
            const bedrockResult = await invokeBedrockConverse(
              {
                modelId: targetModel,
                messages: body.messages,
                systemPrompt: body.systemPrompt,
                maxTokens: 4096,
              },
              creds
            );

            // Increment quota
            const newCount = await incrementRequestCount(env, rateLimitKey, currentCount);
            await incrementRequestCount(env, ipRateLimitKey, currentIpCount);
            const remaining = Math.max(0, cap - newCount);

            // Return in standard Anthropic/OpenAI compatible format
            const responsePayload = {
              id: `msg_bedrock_${Date.now()}`,
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: bedrockResult.text }],
              model: targetModel,
              usage: bedrockResult.usage ? {
                input_tokens: bedrockResult.usage.inputTokens,
                output_tokens: bedrockResult.usage.outputTokens,
              } : undefined,
            };

            return new Response(JSON.stringify(responsePayload), {
              status: 200,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'X-RateLimit-Limit': String(cap),
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': getResetTimestamp(),
              },
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return new Response(
              JSON.stringify({
                error: 'upstream_provider_failure',
                message: `AWS Bedrock error: ${msg}. Your quota was not charged.`,
              }),
              { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Priority B: Anthropic fallback
        if (hasAnthropic) {
          const apiKey = env.ANTHROPIC_API_KEY!;
          const formattedMessages = body.messages
            .filter((m: any) => m.role === 'user' || m.role === 'assistant')
            .map((m: any) => ({
              role: m.role,
              content: m.content,
            }));

          const upstreamModel = body.model || env.DEFAULT_MODEL || 'claude-3-5-haiku-20241022';

          const anthropicPayload: Record<string, unknown> = {
            model: upstreamModel,
            max_tokens: 4096,
            messages: formattedMessages,
            stream: body.stream !== false,
          };

          if (body.systemPrompt) {
            anthropicPayload.system = body.systemPrompt;
          }

          let upstreamRes: Response;
          try {
            upstreamRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify(anthropicPayload),
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return new Response(
              JSON.stringify({
                error: 'upstream_error',
                message: `Failed connecting to upstream AI provider: ${msg}`,
              }),
              { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (!upstreamRes.ok) {
            const remainingUnchanged = Math.max(0, cap - currentCount);
            const errHeaders = new Headers();
            for (const [k, v] of Object.entries(corsHeaders)) {
              errHeaders.set(k, v);
            }
            errHeaders.set('Content-Type', 'application/json');
            errHeaders.set('X-RateLimit-Limit', String(cap));
            errHeaders.set('X-RateLimit-Remaining', String(remainingUnchanged));
            errHeaders.set('X-RateLimit-Reset', getResetTimestamp());

            let errorDetails = '';
            try {
              const errJson: any = await upstreamRes.json();
              errorDetails = errJson.error?.message || errJson.message || JSON.stringify(errJson);
            } catch {
              errorDetails = `HTTP ${upstreamRes.status}`;
            }

            return new Response(
              JSON.stringify({
                error: 'upstream_provider_failure',
                message: `Anthropic API error (${upstreamRes.status}): ${errorDetails}. Your free daily quota was not charged.`,
                status: upstreamRes.status,
              }),
              { status: upstreamRes.status, headers: errHeaders }
            );
          }

          const newCount = await incrementRequestCount(env, rateLimitKey, currentCount);
          await incrementRequestCount(env, ipRateLimitKey, currentIpCount);
          const remaining = Math.max(0, cap - newCount);

          const responseHeaders = new Headers(upstreamRes.headers);
          for (const [k, v] of Object.entries(corsHeaders)) {
            responseHeaders.set(k, v);
          }
          responseHeaders.set('X-RateLimit-Limit', String(cap));
          responseHeaders.set('X-RateLimit-Remaining', String(remaining));
          responseHeaders.set('X-RateLimit-Reset', getResetTimestamp());

          return new Response(upstreamRes.body, {
            status: upstreamRes.status,
            headers: responseHeaders,
          });
        }
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
