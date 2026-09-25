export interface RateLimiterBinding {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
}

export interface Env {
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
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'aeio-free-proxy',
          version: '1.1.0',
          dailyCap: cap,
          defaultModel: env.DEFAULT_MODEL || 'claude-3-5-haiku-20241022',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Chat Proxy Endpoint
    if (url.pathname === '/v1/chat') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 1. Extract Client IP
      const clientIp =
        request.headers.get('cf-connecting-ip')?.trim() ||
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        '127.0.0.1';

      // 2. Check Cloudflare Rate Limiter binding for sub-minute burst protection
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
        } catch {
          // Non-blocking fallback if binding is not supported in local dev
        }
      }

      // 3. Check Anonymous Installation ID
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

      // 4. Check IP Daily Quota (Independent layer against UUID recycling / cache clearing)
      const ipCap = parseInt(env.DAILY_IP_CAP || '50', 10);
      const ipRateLimitKey = getIpRateLimitKey(clientIp);
      const currentIpCount = await getRequestCount(env, ipRateLimitKey);

      if (currentIpCount >= ipCap) {
        const resetAt = getResetTimestamp();
        return new Response(
          JSON.stringify({
            error: 'ip_rate_limit_exceeded',
            message:
              "Too many requests from this network today — add your own API key for unlimited use, or wait until tomorrow.",
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

      // 5. Check Installation ID Daily Quota
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

      // Parse Request Body
      let body: ChatPayload;
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

      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return new Response(
          JSON.stringify({ error: 'invalid_messages', message: 'Field "messages" array is required.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Forward to Upstream Provider (Claude 3.5 Haiku by default, OpenAI GPT-4o-mini as alternative)
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return new Response(
          JSON.stringify({
            error: 'backend_unconfigured',
            message: 'Hosted proxy server is missing ANTHROPIC_API_KEY. Configure upstream secret in Cloudflare.',
          }),
          {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const formattedMessages = body.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
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
          {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Check if upstream accepted and succeeded (2xx)
      if (!upstreamRes.ok) {
        // Do NOT consume user quota on upstream provider failure (bad key, outage, Anthropic 429/529)
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
          {
            status: upstreamRes.status,
            headers: errHeaders,
          }
        );
      }

      // Upstream succeeded (200-299): increment the rate limit counters
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

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
