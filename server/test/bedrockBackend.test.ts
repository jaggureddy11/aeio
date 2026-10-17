import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { Env, inMemoryRateLimitStore } from '../src/index';

describe('AWS Bedrock Backend Endpoints', () => {
  let mockEnv: Env;

  beforeEach(() => {
    inMemoryRateLimitStore.clear();
    mockEnv = {
      AWS_REGION: 'ap-southeast-2',
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
      AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      BEDROCK_MODEL: 'amazon.nova-pro-v1:0',
      DAILY_MESSAGE_CAP: '30',
    };

    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);

      if (urlStr.includes('bedrock-runtime.ap-southeast-2.amazonaws.com')) {
        return new Response(
          JSON.stringify({
            output: {
              message: {
                role: 'assistant',
                content: [
                  {
                    text: 'Bedrock response from Amazon Nova Pro: Task analyzed and ready.',
                  },
                ],
              },
            },
            usage: {
              inputTokens: 20,
              outputTokens: 15,
              totalTokens: 35,
            },
            stopReason: 'end_turn',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not found', { status: 404 });
    });
  });

  it('GET /v1/models returns AWS Bedrock model catalog', async () => {
    const req = new Request('https://proxy.aeio.internal/v1/models', { method: 'GET' });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.models).toBeDefined();
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.region).toBe('ap-southeast-2');
    expect(body.models.some((m: any) => m.id === 'amazon.nova-pro-v1:0')).toBe(true);
  });

  it('POST /v1/chat routes to AWS Bedrock and formats response', async () => {
    const req = new Request('https://proxy.aeio.internal/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': 'bedrock-client-001',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Organize my downloads folder' }],
      }),
    });

    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.role).toBe('assistant');
    expect(body.content[0].text).toContain('Bedrock response from Amazon Nova Pro');
    expect(body.usage.input_tokens).toBe(20);
    expect(body.usage.output_tokens).toBe(15);
  });

  it('POST /v1/agent/plan generates structured execution plan', async () => {
    // Mock Bedrock returning a JSON plan in code fences
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      const planJson = {
        goal: 'Open Spotify and play rock music',
        summary: 'Will launch Spotify and send media play command',
        estimatedSteps: 2,
        steps: [
          {
            stepNumber: 1,
            description: 'Open Spotify app',
            toolName: 'open_app',
            toolArgs: { appName: 'Spotify' },
            requiresApproval: false,
          },
          {
            stepNumber: 2,
            description: 'Start playback of rock genre',
            toolName: 'play_spotify',
            toolArgs: { query: 'classic rock' },
            requiresApproval: false,
          },
        ],
      };

      return new Response(
        JSON.stringify({
          output: {
            message: {
              role: 'assistant',
              content: [{ text: `\`\`\`json\n${JSON.stringify(planJson)}\n\`\`\`` }],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const req = new Request('https://proxy.aeio.internal/v1/agent/plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': 'agent-planner-client',
      },
      body: JSON.stringify({
        goal: 'Open Spotify and play rock music',
        availableTools: [
          { name: 'open_app', description: 'Opens application by name' },
          { name: 'play_spotify', description: 'Plays query on Spotify' },
        ],
      }),
    });

    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.plan.steps).toHaveLength(2);
    expect(body.plan.steps[0].toolName).toBe('open_app');
    expect(body.plan.steps[1].toolName).toBe('play_spotify');
  });

  it('POST /v1/agent/step decides single next action', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      const stepJson = {
        thought: 'Spotify is not running yet, I must launch it first.',
        toolName: 'open_app',
        toolArgs: { appName: 'Spotify' },
        isTerminal: false,
      };

      return new Response(
        JSON.stringify({
          output: {
            message: {
              role: 'assistant',
              content: [{ text: `\`\`\`json\n${JSON.stringify(stepJson)}\n\`\`\`` }],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const req = new Request('https://proxy.aeio.internal/v1/agent/step', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Installation-Id': 'agent-step-client',
      },
      body: JSON.stringify({
        goal: 'Play rock on Spotify',
        stepsHistory: [],
        availableTools: [{ name: 'open_app', description: 'Opens application by name' }],
      }),
    });

    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.decision.toolName).toBe('open_app');
    expect(body.decision.isTerminal).toBe(false);
  });

  it('sustains 20 simultaneous concurrent users with anonymous rate tracking and zero errors', async () => {
    const CONCURRENT_USERS = 20;
    const requests = Array.from({ length: CONCURRENT_USERS }, (_, i) => {
      const clientId = `concurrent-user-${i + 1}`;
      const req = new Request('https://proxy.aeio.internal/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Installation-Id': clientId,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Query from user ${i + 1}` }],
        }),
      });
      return worker.fetch(req, mockEnv);
    });

    const responses = await Promise.all(requests);
    expect(responses).toHaveLength(CONCURRENT_USERS);

    for (let i = 0; i < responses.length; i++) {
      const res = responses[i];
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.role).toBe('assistant');
      expect(json.content[0].text).toBeDefined();
    }
  });
});

