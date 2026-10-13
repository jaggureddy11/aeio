import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inspectActiveScreen } from '../lib/vision/screenInspector';
import * as ipc from '../lib/ipc';
import * as orchestrator from '../lib/providers/orchestrator';
import { OllamaProvider } from '../lib/providers/ollama';
import { QwenCoderProvider } from '../lib/providers/qwenCoder';
import { ClaudeProvider } from '../lib/providers/claude';
import { GeminiProvider } from '../lib/providers/gemini';
import { OpenAIProvider } from '../lib/providers/openai';
import { matchAndExecuteFastAction } from '../lib/voice/voiceEngine';
import { useChatStore } from '../stores/chatStore';

describe('Multi-Modal Visual Screen Inspector', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('inspectActiveScreen Core Pipeline', () => {
    it('captures desktop screen and active window context then invokes orchestrateChat', async () => {
      const mockScreenData: ipc.ScreenData = {
        base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        width: 1920,
        height: 1080,
        filePath: '/tmp/aeio_screen_test.png',
      };

      const mockActiveWindow: ipc.ActiveWindowInfo = {
        app_name: 'Visual Studio Code',
        title: 'main.rs - aeio',
      };

      vi.spyOn(ipc, 'captureScreenData').mockResolvedValue(mockScreenData);
      vi.spyOn(ipc, 'getActiveWindow').mockResolvedValue(mockActiveWindow);

      const orchestrateSpy = vi.spyOn(orchestrator, 'orchestrateChat').mockResolvedValue({
        content: '# Rust Syntax Inspection\nFound an unclosed delimiter on line 42.\n* Add semicolon on line 42\n* Recompile with cargo check',
        modelName: 'qwen2.5:7b',
        providerId: 'ollama',
        isLocal: true,
        taskType: 'code',
      });

      const result = await inspectActiveScreen();

      expect(ipc, 'captureScreenData').toBeDefined();
      expect(ipc.captureScreenData).toHaveBeenCalled();
      expect(ipc.getActiveWindow).toHaveBeenCalled();
      expect(orchestrateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            images: [mockScreenData.base64],
          }),
        ]),
        expect.objectContaining({
          systemPrompt: expect.stringContaining('Visual Studio Code'),
        })
      );

      expect(result.summary).toBe('Rust Syntax Inspection');
      expect(result.suggestedActions).toEqual([
        'Add semicolon on line 42',
        'Recompile with cargo check',
      ]);
      expect(result.screenData).toEqual(mockScreenData);
      expect(result.activeWindow).toEqual(mockActiveWindow);
    });

    it('respects custom prompt and gracefully handles missing window context', async () => {
      const mockScreenData: ipc.ScreenData = {
        base64: 'mock_base64_data',
        width: 1280,
        height: 800,
        filePath: '/tmp/mock.png',
      };

      vi.spyOn(ipc, 'captureScreenData').mockResolvedValue(mockScreenData);
      vi.spyOn(ipc, 'getActiveWindow').mockRejectedValue(new Error('Permission denied'));

      const orchestrateSpy = vi.spyOn(orchestrator, 'orchestrateChat').mockResolvedValue({
        content: 'You are viewing a browser tab with documentation.',
        modelName: 'claude-3-7-sonnet',
        providerId: 'claude',
        isLocal: false,
        taskType: 'conversational',
      });

      const result = await inspectActiveScreen('Diagnose layout alignment issues', mockScreenData);

      expect(result.activeWindow).toBeNull();
      expect(orchestrateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'Diagnose layout alignment issues',
            images: ['mock_base64_data'],
          }),
        ]),
        expect.any(Object)
      );
      expect(result.analysis).toBe('You are viewing a browser tab with documentation.');
    });
  });

  describe('Multi-Modal Provider Image Formatting', () => {
    const sampleImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';
    const cleanImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';

    it('OllamaProvider attaches image byte arrays directly in chat messages', async () => {
      const provider = new OllamaProvider();
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ message: { content: 'Visual analysis complete' } }), {
          status: 200,
        });
      });

      await provider.chat([
        {
          role: 'user',
          content: 'What is this?',
          images: [sampleImage],
        },
      ]);

      expect(capturedBody.messages[0].images).toEqual([cleanImageBase64]);
    });

    it('QwenCoderProvider formats image arrays for local vision', async () => {
      const provider = new QwenCoderProvider();
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ message: { content: 'Code layout inspected' } }), {
          status: 200,
        });
      });

      await provider.chat([
        {
          role: 'user',
          content: 'Examine this code',
          images: [cleanImageBase64],
        },
      ]);

      expect(capturedBody.messages[0].images).toEqual([cleanImageBase64]);
    });

    it('ClaudeProvider formats Anthropic vision block payloads', async () => {
      const provider = new ClaudeProvider();
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Claude visual inspection' }] }), {
          status: 200,
        });
      });

      await provider.chat(
        [
          {
            role: 'user',
            content: 'Explain screen',
            images: [sampleImage],
          },
        ],
        { apiKey: 'sk-ant-test' }
      );

      const userMsg = capturedBody.messages[0];
      expect(Array.isArray(userMsg.content)).toBe(true);
      expect(userMsg.content[0]).toEqual({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: cleanImageBase64,
        },
      });
      expect(userMsg.content[1]).toEqual({
        type: 'text',
        text: 'Explain screen',
      });
    });

    it('GeminiProvider formats inlineData image parts', async () => {
      const provider = new GeminiProvider();
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Gemini visual inspection' }] } }],
          }),
          { status: 200 }
        );
      });

      await provider.chat(
        [
          {
            role: 'user',
            content: 'Describe image',
            images: [sampleImage],
          },
        ],
        { apiKey: 'ai-gemini-test' }
      );

      const userContent = capturedBody.contents[0];
      expect(userContent.parts[0]).toEqual({
        inlineData: {
          mimeType: 'image/png',
          data: cleanImageBase64,
        },
      });
      expect(userContent.parts[1]).toEqual({
        text: 'Describe image',
      });
    });

    it('OpenAIProvider formats image_url data URL blocks', async () => {
      const provider = new OpenAIProvider();
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OpenAI vision output' } }],
          }),
          { status: 200 }
        );
      });

      await provider.chat(
        [
          {
            role: 'user',
            content: 'Review screen',
            images: [cleanImageBase64],
          },
        ],
        { apiKey: 'sk-proj-test' }
      );

      const userMsg = capturedBody.messages[0];
      expect(userMsg.content[0]).toEqual({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${cleanImageBase64}`,
        },
      });
      expect(userMsg.content[1]).toEqual({
        type: 'text',
        text: 'Review screen',
      });
    });
  });

  describe('Voice & Chat Store Integration', () => {
    it('matches voice queries for screen inspection deterministically', async () => {
      vi.spyOn(ipc, 'captureScreenData').mockResolvedValue({
        base64: 'abc123',
        width: 1920,
        height: 1080,
        filePath: '/tmp/aeio.png',
      });
      vi.spyOn(ipc, 'getActiveWindow').mockResolvedValue({
        app_name: 'Aeio',
        title: 'Aeio Assistant',
      });
      vi.spyOn(orchestrator, 'orchestrateChat').mockResolvedValue({
        content: 'You have VS Code open with Rust code.',
        modelName: 'qwen2.5:7b',
        providerId: 'ollama',
        isLocal: true,
        taskType: 'conversational',
      });

      const res1 = await matchAndExecuteFastAction('what am I looking at right now');
      expect(res1?.handledDeterministically).toBe(true);
      expect(res1?.actionType).toBe('inspect_screen');

      const res2 = await matchAndExecuteFastAction('inspect my screen');
      expect(res2?.handledDeterministically).toBe(true);
      expect(res2?.actionType).toBe('inspect_screen');

      const res3 = await matchAndExecuteFastAction('what is on my screen');
      expect(res3?.handledDeterministically).toBe(true);
      expect(res3?.actionType).toBe('inspect_screen');
    });

    it('chatStore inspectCurrentScreen adds user snapshot message and completes assistant response', async () => {
      vi.spyOn(ipc, 'captureScreenData').mockResolvedValue({
        base64: 'frame_base64',
        width: 1920,
        height: 1080,
        filePath: '/tmp/test.png',
      });
      vi.spyOn(ipc, 'getActiveWindow').mockResolvedValue({
        app_name: 'Terminal',
        title: 'zsh',
      });
      vi.spyOn(ipc, 'saveChatMessage').mockResolvedValue();
      vi.spyOn(ipc, 'clearChatHistory').mockResolvedValue();
      vi.spyOn(ipc, 'playSystemEarcon').mockResolvedValue();
      vi.spyOn(orchestrator, 'orchestrateChat').mockResolvedValue({
        content: '# Build Error Detected\nFound compilation error.',
        modelName: 'qwen2.5:7b',
        providerId: 'ollama',
        isLocal: true,
        taskType: 'code',
      });

      useChatStore.getState().clearMessages();

      await useChatStore.getState().inspectCurrentScreen('What failed in this terminal?');

      const messages = useChatStore.getState().messages;
      expect(messages.length).toBeGreaterThanOrEqual(2);

      const userMsg = messages[messages.length - 2];
      expect(userMsg.role).toBe('user');
      expect(userMsg.content).toBe('What failed in this terminal?');
      expect(userMsg.screenSnapshot?.base64).toBe('frame_base64');
      expect(userMsg.activeWindowContext?.app_name).toBe('Terminal');

      const assistantMsg = messages[messages.length - 1];
      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.content).toContain('Build Error Detected');
      expect(assistantMsg.isStreaming).toBe(false);
    });
  });
});
