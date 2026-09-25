import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, {
  Env,
  inMemoryRateLimitStore,
  getRateLimitKey,
  getResetTimestamp,
} from '../src/index';

describe('Aeio Free Hosted Proxy Server', () => {
  const originalFetch = globalThis.fetch;
  let mockEnv: Env;

  beforeEach(() => {
    inMemoryRateLimitStore.clear();
    mockEnv = {
      ANTHROPIC_API_KEY: 'sk-ant-test-secret-server-key',
      DAILY_MESSAGE_CAP: '30',
      DEFAULT_MODEL: 'claude-3-5-haiku-20241022',
    };
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('api.anthropic.com')) {
        return new Response(
          JSON.stringify({
            id: 'msg_test123',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Free tier response via Claude 3.5 Haiku' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    });
  });

  it('GET /health returns service status and configured cap', async () => {
    const req = new Request('https://proxy.aeio.internal/health', { method: 'GET' });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.dailyCap).toBe(30);
    expect(body.service).toBe('aeio-free-proxy');
  });

  it('POST /v1/chat rejects requests missing X-Installation-Id with 400', async () => {
    const req = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_installation_id');
  });

  it('POST /v1/chat rejects empty messages payload with 400', async () => {
    const req = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': 'client-uuid-001',
      },
      body: JSON.stringify({ messages: [] }),
    });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_messages');
  });

  it('POST /v1/chat returns 503 when backend secret API key is not configured', async () => {
    const unconfiguredEnv: Env = {
      DAILY_MESSAGE_CAP: '30',
    };
    const req = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': 'client-uuid-001',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is 2+2?' }],
      }),
    });
    const res = await worker.fetch(req, unconfiguredEnv);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('backend_unconfigured');
  });

  it('POST /v1/chat proxies successfully and decrements remaining quota', async () => {
    const req = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': 'client-uuid-happy-path',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Help me draft a test plan' }],
        systemPrompt: 'You are Aeio assistant',
      }),
    });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('29');
    expect(res.headers.get('X-RateLimit-Reset')).toBe(getResetTimestamp());
  });

  it('does NOT consume quota or increment counter when upstream Anthropic call fails (e.g. 401/500/529)', async () => {
    // Mock Anthropic returning an error (e.g. 401 invalid API key or 529 overloaded)
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('api.anthropic.com')) {
        return new Response(
          JSON.stringify({
            type: 'error',
            error: { type: 'authentication_error', message: 'invalid x-api-key' },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const installId = 'test-client-zero-charge';
    const req = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': installId,
        'cf-connecting-ip': '198.51.100.99',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Will this charge quota?' }],
      }),
    });

    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(401);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('30');
    // Remaining MUST still be 30 (unchanged, NOT decremented to 29)
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('30');

    const body = await res.json();
    expect(body.error).toBe('upstream_provider_failure');
    expect(body.message).toContain('Your free daily quota was not charged');

    // Confirm in-memory store has NOT recorded any usage for this ID or IP
    const idKey = getRateLimitKey(installId);
    expect(inMemoryRateLimitStore.get(idKey) || 0).toBe(0);
    expect(inMemoryRateLimitStore.get('ratelimit:ip:198.51.100.99:' + new Date().toISOString().slice(0, 10)) || 0).toBe(0);
  });

  it('correctly increments quota counter exactly once on a successful 200 response', async () => {
    const installId = 'test-client-single-increment';
    const req = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': installId,
        'cf-connecting-ip': '198.51.100.100',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Successful call' }],
      }),
    });

    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('29');

    const idKey = getRateLimitKey(installId);
    expect(inMemoryRateLimitStore.get(idKey)).toBe(1);
    expect(inMemoryRateLimitStore.get('ratelimit:ip:198.51.100.100:' + new Date().toISOString().slice(0, 10))).toBe(1);
  });

  it('POST /v1/chat enforces 30 messages/day rate limit and returns explicit 429 payload', async () => {
    const installId = 'test-rate-limit-user-999';

    // Simulate sending 30 requests up to the cap
    for (let i = 1; i <= 30; i++) {
      const req = new Request('https://proxy.aeio.internal/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Installation-Id': installId,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Message #${i}` }],
        }),
      });
      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe(String(30 - i));
    }

    // The 31st request MUST be rejected with HTTP 429
    const overLimitReq = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': installId,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Message #31 over limit' }],
      }),
    });
    const rejectedRes = await worker.fetch(overLimitReq, mockEnv);
    expect(rejectedRes.status).toBe(429);
    expect(rejectedRes.headers.get('X-RateLimit-Remaining')).toBe('0');

    const errBody = await rejectedRes.json();
    expect(errBody.error).toBe('rate_limit_exceeded');
    expect(errBody.message).toBe(
      "You've used today's free messages — add your own API key for unlimited use, or wait until tomorrow."
    );
    expect(errBody.limit).toBe(30);
    expect(errBody.remaining).toBe(0);
    expect(errBody.resetAt).toBeDefined();

    // Verify a different installation ID from a different IP is NOT rate-limited
    const otherReq = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': 'different-user-client-002',
        'cf-connecting-ip': '198.51.100.42',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'First message from other user' }],
      }),
    });
    const otherRes = await worker.fetch(otherReq, mockEnv);
    expect(otherRes.status).toBe(200);
    expect(otherRes.headers.get('X-RateLimit-Remaining')).toBe('29');
  });

  it('enforces IP rate limiting and blocks an attacker attempting to bypass limits by rotating UUIDs', async () => {
    const fixedIp = '203.0.113.88';
    const ipLimitedEnv: Env = {
      ...mockEnv,
      DAILY_MESSAGE_CAP: '10',
      DAILY_IP_CAP: '15',
    };

    // User A on this IP consumes 10 requests (hits installation ID limit)
    for (let i = 1; i <= 10; i++) {
      const req = new Request('https://proxy.aeio.internal/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Installation-Id': 'user-a-uuid',
          'cf-connecting-ip': fixedIp,
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: `Msg A-${i}` }] }),
      });
      const res = await worker.fetch(req, ipLimitedEnv);
      expect(res.status).toBe(200);
    }

    // 11th request with User A UUID gets 429 rate_limit_exceeded
    const userAOver = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': 'user-a-uuid',
        'cf-connecting-ip': fixedIp,
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Msg A-11' }] }),
    });
    const userARes = await worker.fetch(userAOver, ipLimitedEnv);
    expect(userARes.status).toBe(429);
    const userABody = await userARes.json();
    expect(userABody.error).toBe('rate_limit_exceeded');

    // Attacker rotates to a fresh UUID (User B) from the same IP to bypass the limit
    // They consume 5 more requests (reaching total 15 for this IP)
    for (let i = 1; i <= 5; i++) {
      const req = new Request('https://proxy.aeio.internal/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Installation-Id': `user-b-uuid-${i}`,
          'cf-connecting-ip': fixedIp,
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: `Bypass attempt ${i}` }] }),
      });
      const res = await worker.fetch(req, ipLimitedEnv);
      expect(res.status).toBe(200);
    }

    // Now IP cap (15) is exhausted. Even with a brand new UUID, request MUST be blocked by IP layer
    const blockedAttackerReq = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': 'brand-new-fresh-uuid-999',
        'cf-connecting-ip': fixedIp,
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Another bypass attempt' }] }),
    });
    const blockedRes = await worker.fetch(blockedAttackerReq, ipLimitedEnv);
    expect(blockedRes.status).toBe(429);
    const blockedBody = await blockedRes.json();
    expect(blockedBody.error).toBe('ip_rate_limit_exceeded');
    expect(blockedBody.message).toContain('Too many requests from this network today');
  });

  it('triggers burst rate limiter when RATE_LIMITER binding rejects', async () => {
    const burstEnv: Env = {
      ...mockEnv,
      RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: false }),
      },
    };
    const req = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': 'client-burst-test',
        'cf-connecting-ip': '1.2.3.4',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Rapid fire' }] }),
    });
    const res = await worker.fetch(req, burstEnv);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('burst_rate_limit_exceeded');
  });
});
