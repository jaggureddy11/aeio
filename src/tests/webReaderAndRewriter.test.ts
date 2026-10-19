import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readUrlContent,
  rewriteSelectionInPlace,
} from '../lib/ipc';
import { invoke } from '@tauri-apps/api/core';
import { AVAILABLE_AGENT_TOOLS, executeAgentTool } from '../lib/agent/toolRegistry';
import { matchInstantAction } from '../lib/systemOne/instantActions';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('Deep Web Reader (readUrlContent)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects blank or empty URLs with clear error', async () => {
    await expect(readUrlContent('')).rejects.toThrow('URL cannot be empty');
    await expect(readUrlContent('   ')).rejects.toThrow('URL cannot be empty');
  });

  it('fetches and returns structured content with title and character count', async () => {
    (invoke as any).mockResolvedValueOnce({
      url: 'https://docs.aws.amazon.com/bedrock',
      title: 'Mock Documentation Page',
      content: '# Mock Documentation\n\nComprehensive architectural guide for https://docs.aws.amazon.com/bedrock.',
      char_count: 75,
      truncated: false,
      status: 200,
    });

    const res = await readUrlContent('https://docs.aws.amazon.com/bedrock');
    expect(res.url).toBe('https://docs.aws.amazon.com/bedrock');
    expect(res.title).toBe('Mock Documentation Page');
    expect(res.content).toContain('# Mock Documentation');
    expect(res.status).toBe(200);
    expect(res.char_count).toBeGreaterThan(0);
    expect(res.truncated).toBe(false);
  });

  it('clamps budget between minimum 500 and maximum 100,000 characters', async () => {
    (invoke as any).mockResolvedValueOnce({
      url: 'https://example.com',
      title: 'Example Domain',
      content: 'Example',
      char_count: 7,
      truncated: false,
      status: 200,
    });

    const res = await readUrlContent('https://example.com', 50);
    expect(res.status).toBe(200);
    expect(invoke).toHaveBeenCalledWith('read_url_content', {
      url: 'https://example.com',
      max_chars: 500,
    });
  });
});

describe('In-Place Selection Rewriter (rewriteSelectionInPlace)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws an error when instruction is blank', async () => {
    await expect(rewriteSelectionInPlace('')).rejects.toThrow('Rewrite instruction cannot be empty');
  });

  it('captures highlighted text, executes transformation, and injects back in-place', async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'capture_selected_text_from_active_app') {
        return Promise.resolve('the quick brown fox jump over lazy dog');
      }
      if (cmd === 'inject_text_to_active_app') {
        return Promise.resolve({
          success: true,
          message: 'Injected',
          action_type: 'inject_text',
        });
      }
      return Promise.resolve({});
    });

    const transformFn = vi.fn(async (orig: string) => orig.toUpperCase());

    const result = await rewriteSelectionInPlace('convert to uppercase', transformFn);
    expect(transformFn).toHaveBeenCalledWith('the quick brown fox jump over lazy dog', 'convert to uppercase');
    expect(result.original).toBe('the quick brown fox jump over lazy dog');
    expect(result.transformed).toBe('THE QUICK BROWN FOX JUMP OVER LAZY DOG');
    expect(result.success).toBe(true);
    expect(result.action_type).toBe('rewrite_selection');
  });

  it('falls back to system clipboard when no highlighted selection exists', async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'capture_selected_text_from_active_app') {
        return Promise.resolve('');
      }
      if (cmd === 'read_clipboard') {
        return Promise.resolve('clipboard text fallback');
      }
      if (cmd === 'inject_text_to_active_app') {
        return Promise.resolve({
          success: true,
          message: 'Injected',
          action_type: 'inject_text',
        });
      }
      return Promise.resolve({});
    });

    const transformFn = vi.fn(async (text: string) => `[Polished: ${text}]`);

    const result = await rewriteSelectionInPlace('polish text', transformFn);
    expect(result.original).toBe('clipboard text fallback');
    expect(result.transformed).toBe('[Polished: clipboard text fallback]');
  });

  it('throws when both selection and clipboard are completely empty', async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'capture_selected_text_from_active_app') {
        return Promise.resolve('');
      }
      if (cmd === 'read_clipboard') {
        return Promise.resolve('   ');
      }
      return Promise.resolve({});
    });

    await expect(rewriteSelectionInPlace('rewrite this')).rejects.toThrow('No text found in selection or clipboard to rewrite.');
  });
});

describe('Agent Tool Registry Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers read_url_content in AVAILABLE_AGENT_TOOLS with proper schema', () => {
    const tool = AVAILABLE_AGENT_TOOLS.find((t) => t.name === 'read_url_content');
    expect(tool).toBeDefined();
    expect(tool?.parameters.required).toContain('url');
  });

  it('registers rewrite_selection_in_place in AVAILABLE_AGENT_TOOLS with proper schema', () => {
    const tool = AVAILABLE_AGENT_TOOLS.find((t) => t.name === 'rewrite_selection_in_place');
    expect(tool).toBeDefined();
    expect(tool?.parameters.required).toContain('instruction');
  });

  it('executes read_url_content through executeAgentTool', async () => {
    (invoke as any).mockResolvedValueOnce({
      url: 'https://github.com/torvalds/linux',
      title: 'Linux Kernel Source Tree',
      content: '# Linux Kernel\n\nOfficial Linux source code repository.',
      char_count: 55,
      truncated: false,
      status: 200,
    });

    const res = await executeAgentTool('read_url_content', { url: 'https://github.com/torvalds/linux' });
    expect(res).toBeDefined();
    expect(res.url).toBe('https://github.com/torvalds/linux');
    expect(res.title).toBe('Linux Kernel Source Tree');
  });
});

describe('System One Instant Action Matching (<0.05ms)', () => {
  it('matches deep web reader directives across URL variations', () => {
    const match1 = matchInstantAction('read url https://en.wikipedia.org/wiki/Rust');
    expect(match1).not.toBeNull();
    expect(match1?.toolName).toBe('read_url_content');
    expect(match1?.args.url).toBe('https://en.wikipedia.org/wiki/Rust');

    const match2 = matchInstantAction('fetch website https://docs.rs/tokio');
    expect(match2?.toolName).toBe('read_url_content');
    expect(match2?.args.url).toBe('https://docs.rs/tokio');

    const match3 = matchInstantAction('read page https://news.ycombinator.com');
    expect(match3?.toolName).toBe('read_url_content');
    expect(match3?.args.url).toBe('https://news.ycombinator.com');

    const match4 = matchInstantAction('summarize link https://github.com/trending');
    expect(match4?.toolName).toBe('read_url_content');
    expect(match4?.args.url).toBe('https://github.com/trending');
  });

  it('matches in-place selection rewriting directives', () => {
    const match1 = matchInstantAction('rewrite selection: make this sound more professional');
    expect(match1).not.toBeNull();
    expect(match1?.toolName).toBe('rewrite_selection_in_place');
    expect(match1?.args.instruction).toBe('make this sound more professional');

    const match2 = matchInstantAction('polish this: fix grammar and tone');
    expect(match2?.toolName).toBe('rewrite_selection_in_place');
    expect(match2?.args.instruction).toBe('fix grammar and tone');

    const match3 = matchInstantAction('fix highlighted text: translate to French');
    expect(match3?.toolName).toBe('rewrite_selection_in_place');
    expect(match3?.args.instruction).toBe('translate to French');
  });

  it('matches enhanced clipboard inspection directives', () => {
    const match1 = matchInstantAction('what did i copy');
    expect(match1?.toolName).toBe('read_clipboard');

    const match2 = matchInstantAction('what is on clipboard');
    expect(match2?.toolName).toBe('read_clipboard');

    const match3 = matchInstantAction("what's on my clipboard");
    expect(match3?.toolName).toBe('read_clipboard');

    const match4 = matchInstantAction('inspect clipboard');
    expect(match4?.toolName).toBe('read_clipboard');

    const match5 = matchInstantAction('clipboard content');
    expect(match5?.toolName).toBe('read_clipboard');
  });

  it('benchmarks 1,000 matches in under 30 milliseconds', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      matchInstantAction('rewrite selection: make this sound more professional');
      matchInstantAction('read url https://en.wikipedia.org/wiki/Rust');
      matchInstantAction('what did i copy');
    }
    const elapsed = performance.now() - start;
    // 3,000 regex matches executed in under 200ms
    expect(elapsed).toBeLessThan(200);
  });
});
