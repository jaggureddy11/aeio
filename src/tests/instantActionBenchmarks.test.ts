import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchInstantAction } from '../lib/systemOne/instantActions';
import { parseBedrockEventStreamFrames } from '../lib/providers/bedrock';
import { useChatStore } from '../stores/chatStore';
import * as ipc from '../lib/ipc';

describe('Instant Actions & Latency Benchmarks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({
      messages: [],
      isLoading: false,
      error: null,
    });
  });

  describe('matchInstantAction pattern matcher (< 1ms)', () => {
    it('matches app launching instantly', () => {
      const match = matchInstantAction('open Google Chrome');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('open_app');
      expect(match?.args.name).toBe('Google Chrome');
      expect(match?.statusText).toBe('Opening Google Chrome...');
      expect(match?.completedMessage).toBe('Opened Google Chrome.');
    });

    it('matches launch command for Spotify', () => {
      const match = matchInstantAction('launch Spotify app');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('open_app');
      expect(match?.args.name).toBe('Spotify');
    });

    it('matches system volume adjustments', () => {
      const match = matchInstantAction('set volume to 75%');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('set_system_volume');
      expect(match?.args.level).toBe(75);
    });

    it('matches mute and unmute commands', () => {
      const muteMatch = matchInstantAction('mute');
      expect(muteMatch?.toolName).toBe('set_system_mute');
      expect(muteMatch?.args.mute).toBe(true);

      const unmuteMatch = matchInstantAction('unmute');
      expect(unmuteMatch?.toolName).toBe('set_system_mute');
      expect(unmuteMatch?.args.mute).toBe(false);
    });

    it('matches media playback commands', () => {
      const playMatch = matchInstantAction('play music');
      expect(playMatch?.toolName).toBe('media_control');
      expect(playMatch?.args.action).toBe('play');

      const nextMatch = matchInstantAction('next song');
      expect(nextMatch?.toolName).toBe('media_control');
      expect(nextMatch?.args.action).toBe('next');
    });

    it('matches YouTube playback queries', () => {
      const match = matchInstantAction('play Bohemian Rhapsody on youtube');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('search_web');
      expect(match?.args.query).toBe('Bohemian Rhapsody');
      expect(match?.args.platform).toBe('youtube');
    });

    it('matches Spotify playback queries', () => {
      const match = matchInstantAction('play Miles Davis on spotify');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('play_spotify');
      expect(match?.args.query).toBe('Miles Davis');
    });

    it('matches web search queries', () => {
      const match = matchInstantAction('google AWS Bedrock Nova pricing');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('search_web');
      expect(match?.args.query).toBe('AWS Bedrock Nova pricing');
      expect(match?.args.platform).toBe('google');
    });

    it('matches screen lock command', () => {
      const match = matchInstantAction('lock screen');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('lock_screen');
    });

    it('matches mathematical expressions', () => {
      const match = matchInstantAction('calculate 125 * 8');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('math_evaluate');
      expect(match?.args.expression).toBe('125 * 8');
    });

    it('matches direct URL and path open commands', () => {
      const match = matchInstantAction('open https://github.com/aws-samples');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('open_target');
      expect(match?.args.target).toBe('https://github.com/aws-samples');
    });

    it('matches clipboard reading commands', () => {
      const match1 = matchInstantAction('read clipboard');
      expect(match1).not.toBeNull();
      expect(match1?.toolName).toBe('read_clipboard');

      const match2 = matchInstantAction("what's on my clipboard");
      expect(match2).not.toBeNull();
      expect(match2?.toolName).toBe('read_clipboard');
    });

    it('matches volume status queries', () => {
      const match = matchInstantAction('what is the volume');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('get_system_volume');
    });

    it('matches keyboard simulation commands', () => {
      const match = matchInstantAction('press enter');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('simulate_key_press');
      expect(match?.args.key).toBe('enter');
    });

    it('matches scroll simulation commands', () => {
      const match = matchInstantAction('scroll down');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('simulate_scroll');
      expect(match?.args.direction).toBe('down');
    });

    it('returns null for multi-step tasks or conversational questions', () => {
      expect(matchInstantAction('open Chrome and then search for apple')).toBeNull();
      expect(matchInstantAction('explain how quicksort works')).toBeNull();
      expect(matchInstantAction('write a python script to parse csv')).toBeNull();
    });
  });

  describe('parseBedrockEventStreamFrames', () => {
    it('correctly decodes binary event frames with contentBlockDelta text', () => {
      const payloadObj = {
        contentBlockDelta: {
          delta: { text: 'Hello Bedrock' },
          contentBlockIndex: 0,
        },
      };
      const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj));
      const headersLength = 0;
      const totalLength = 16 + headersLength + payloadBytes.length;

      const buffer = new Uint8Array(totalLength);
      const view = new DataView(buffer.buffer);
      view.setUint32(0, totalLength, false);
      view.setUint32(4, headersLength, false);
      view.setUint32(8, 0x12345678, false); // prelude CRC dummy
      buffer.set(payloadBytes, 12);
      view.setUint32(totalLength - 4, 0x87654321, false); // message CRC dummy

      const chunks: string[] = [];
      const result = parseBedrockEventStreamFrames(buffer, (t) => chunks.push(t));

      expect(chunks).toEqual(['Hello Bedrock']);
      expect(result.textDeltas).toEqual(['Hello Bedrock']);
      expect(result.remaining.length).toBe(0);
    });
  });

  describe('End-to-end instant action execution speed', () => {
    it('executes open_app in sub-second time without contacting cloud LLM', async () => {
      const mockResult: ipc.AutomationResult = {
        success: true,
        message: 'Application Chrome opened',
        action_type: 'open_app',
      };
      const openAppSpy = vi.spyOn(ipc, 'openApp').mockResolvedValue(mockResult);
      const start = performance.now();

      await useChatStore.getState().sendMessage('open Chrome');

      const elapsedMs = performance.now() - start;

      // Must complete in under 500ms (fraction of a second)
      expect(elapsedMs).toBeLessThan(500);
      expect(openAppSpy).toHaveBeenCalledWith('Chrome');

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('open Chrome');

      const assistant = messages[1];
      expect(assistant.role).toBe('assistant');
      expect(assistant.content).toBe('Opened Chrome.');
      expect(assistant.toolExecutions).toBeDefined();
      expect(assistant.toolExecutions![0].status).toBe('approved');
      expect(assistant.toolExecutions![0].result).toEqual(mockResult);
    });

    it('executes volume control in sub-second time', async () => {
      const volSpy = vi.spyOn(ipc, 'setSystemVolume').mockResolvedValue({
        success: true,
        message: 'Volume set to 65%',
        action_type: 'set_system_volume',
      });
      const start = performance.now();

      await useChatStore.getState().sendMessage('volume 65');

      const elapsedMs = performance.now() - start;
      expect(elapsedMs).toBeLessThan(500);
      expect(volSpy).toHaveBeenCalledWith(65);

      const assistant = useChatStore.getState().messages[1];
      expect(assistant.content).toBe('System volume set to 65%.');
      expect(assistant.toolExecutions![0].status).toBe('approved');
    });

    it('evaluates math in sub-second time', async () => {
      const start = performance.now();

      await useChatStore.getState().sendMessage('calculate 45 * 10');

      const elapsedMs = performance.now() - start;
      expect(elapsedMs).toBeLessThan(500);

      const assistant = useChatStore.getState().messages[1];
      expect(assistant.content).toContain('45 * 10 = 450');
      expect(assistant.toolExecutions![0].status).toBe('approved');
    });
  });
});
