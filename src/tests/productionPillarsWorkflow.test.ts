/**
 * @file productionPillarsWorkflow.test.ts
 * @description Comprehensive unit and integration test suite for the 4 production pillars:
 * 1. Puppeteer Workflow Automation in System One Instant Actions
 * 2. SearXNG Web Search Retrieval & Tool Formatter
 * 3. OOP Encapsulation & Information Hiding (PuppeteerArtifactViewModel & SearchResultViewModel)
 * 4. UI Artifact Presentation Models
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchInstantAction } from '../lib/systemOne/instantActions';
import {
  PuppeteerArtifactViewModel,
  PuppeteerActionResult,
} from '../lib/agent/tools/puppeteerTool';
import {
  SearchResultViewModel,
  SearxngResultItem,
  searxngSearchService,
} from '../lib/agent/tools/searxngSearch';
import { executeAgentTool } from '../lib/agent/toolRegistry';

describe('Production Engineering Pillars: Browser Automation, Search & OOP Encapsulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pillar 1 & 2: Puppeteer Browser Automation in System One Instant Actions', () => {
    it('1.1 matches "search for MrBeast and save screenshot as mrbeast.png"', () => {
      const match = matchInstantAction('search for MrBeast and save screenshot as mrbeast.png');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_search_and_navigate');
      expect(match?.args.query).toBe('MrBeast');
      expect(match?.args.outputPath).toBe('mrbeast.png');
      expect(match?.args.headless).toBe(true);
    });

    it('1.2 matches headed search and screenshot when visible/headed is requested', () => {
      const match = matchInstantAction('headed search for OpenAI and save screenshot as openai.png');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_search_and_navigate');
      expect(match?.args.headless).toBe(false);
    });

    it('1.3 matches direct webpage screenshot', () => {
      const match = matchInstantAction('take screenshot of https://github.com to github.png');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_screenshot');
      expect(match?.args.url).toBe('https://github.com');
      expect(match?.args.outputPath).toBe('github.png');
      expect(match?.args.headless).toBe(true);
    });

    it('1.4 matches webpage scraping via System One', () => {
      const match = matchInstantAction('scrape content from https://news.ycombinator.com');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_action');
      expect(match?.args.action).toBe('scrape');
      expect(match?.args.url).toBe('https://news.ycombinator.com');
      expect(match?.args.selector).toBe('body');
    });

    it('1.5 matches PDF generation via System One', () => {
      const match = matchInstantAction('save page https://example.com as pdf example.pdf');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_action');
      expect(match?.args.action).toBe('pdf');
      expect(match?.args.url).toBe('https://example.com');
      expect(match?.args.outputPath).toBe('example.pdf');
    });
  });

  describe('Pillar 3: OOP Principles, Encapsulation & Information Hiding', () => {
    it('3.1 PuppeteerArtifactViewModel strictly encapsulates raw process artifacts', () => {
      const rawResult: PuppeteerActionResult = {
        success: true,
        action: 'search_and_navigate',
        outputPath: 'mrbeast.png',
        destinationTitle: 'MrBeast - YouTube',
        destinationUrl: 'https://www.youtube.com/user/MrBeast6000',
        resultsCount: 10,
        durationMs: 3450,
        rawStdout: '{"json": true}\nDEBUG: child process pid 9988\nCDP FrameNavigated\n',
      };

      const vm = new PuppeteerArtifactViewModel(rawResult, true);

      // Verify public essential getters
      expect(vm.action).toBe('search_and_navigate');
      expect(vm.success).toBe(true);
      expect(vm.displayTitle).toContain('MrBeast - YouTube');
      expect(vm.screenshotPath).toBe('mrbeast.png');
      expect(vm.destinationUrl).toBe('https://www.youtube.com/user/MrBeast6000');
      expect(vm.hasArtifact).toBe(true);
      expect(vm.isHeadless).toBe(true);
      expect(vm.summary).toContain('mrbeast.png');

      // Verify information hiding: rawStdout and internal debugger trace are NOT accessible via public interface
      const keys = Object.keys(vm);
      expect(keys).not.toContain('rawStdout');
      expect(keys).not.toContain('stepTrace');
      expect((vm as any).rawStdout).toBeUndefined();
    });

    it('3.2 PuppeteerArtifactViewModel handles failure with safe user-facing message', () => {
      const rawResult: PuppeteerActionResult = {
        success: false,
        action: 'screenshot',
        error: 'Target URL unreachable or timeout exceeded',
        rawStdout: 'FATAL: net::ERR_NAME_NOT_RESOLVED',
      };

      const vm = PuppeteerArtifactViewModel.fromAny(rawResult);
      expect(vm).not.toBeNull();
      expect(vm?.success).toBe(false);
      expect(vm?.displayTitle).toBe('Automation Failed (screenshot)');
      expect(vm?.summary).toBe('Target URL unreachable or timeout exceeded');
      expect(vm?.hasArtifact).toBe(false);
    });

    it('3.3 SearchResultViewModel encapsulates raw engine scores and internal metadata', () => {
      const items: SearxngResultItem[] = [
        {
          title: 'Tauri 2.0 Released',
          url: 'https://v2.tauri.app/blog/tauri-2-0',
          content: 'Tauri 2.0 is officially released with mobile support and enhanced security.',
          score: 0.98,
          engine: 'google',
        },
      ];

      const vm = SearchResultViewModel.create('tauri 2.0', items);
      expect(vm.hasResults).toBe(true);
      expect(vm.count).toBe(1);
      expect(vm.essentialSources.length).toBe(1);

      const source = vm.essentialSources[0];
      expect(source.title).toBe('Tauri 2.0 Released');
      expect(source.domain).toBe('v2.tauri.app');
      expect(source.url).toBe('https://v2.tauri.app/blog/tauri-2-0');

      // Verify information hiding: internal score and engine are hidden from essential contract
      expect((source as any).score).toBeUndefined();
      expect((source as any).engine).toBeUndefined();
    });
  });

  describe('Pillar 4: SearXNG Web Search Integration & Tool Registry Routing', () => {
    it('4.1 searxngSearchService builds compliant SearXNG search URLs', () => {
      const url = searxngSearchService.buildUrl('Tauri mobile support', 'http://localhost:8080');
      expect(url).toContain('http://localhost:8080/search?');
      expect(url).toContain('q=Tauri%20mobile%20support');
      expect(url).toContain('format=json');
      expect(url).toContain('language=en');
    });

    it('4.2 executeAgentTool dispatches puppeteer_action smoothly', async () => {
      const res = await executeAgentTool('puppeteer_action', {
        action: 'scrape',
        url: 'https://news.ycombinator.com',
      });

      expect(res).toBeDefined();
      expect(res.action).toBe('scrape');
    });
  });
});
