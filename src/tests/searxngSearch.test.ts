import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSearxngUrl,
  extractQueryKeywords,
  filterRelevantResults,
  formatSearchContext,
  searchSearxng,
  searxngSearchService,
  SearxngSearchService,
  SearchResultViewModel,
} from '../lib/agent/tools/searxngSearch';
import { executeAgentTool, AVAILABLE_AGENT_TOOLS } from '../lib/agent/toolRegistry';
import { useSettingsStore } from '../stores/settingsStore';

describe('SearXNG Web Search Tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.setState({ searxngUrl: 'http://localhost:8080' });
  });

  describe('Tool Definitions', () => {
    it('registers searxng_search and updated search_web in AVAILABLE_AGENT_TOOLS', () => {
      const searxngTool = AVAILABLE_AGENT_TOOLS.find((t) => t.name === 'searxng_search');
      expect(searxngTool).toBeDefined();
      expect(searxngTool?.description).toContain('SearXNG');
      expect(searxngTool?.description).toContain('{SEARXNG_URL}/search?q={query}&format=json&language=en');

      const searchWeb = AVAILABLE_AGENT_TOOLS.find((t) => t.name === 'search_web');
      expect(searchWeb).toBeDefined();
      expect(searchWeb?.parameters.properties.platform.enum).toContain('searxng');
    });
  });

  describe('buildSearxngUrl', () => {
    it('formats URL with query, format=json, and language=en', () => {
      const url = buildSearxngUrl('latest quantum computing breakthroughs', 'http://127.0.0.1:8888');
      expect(url).toBe(
        'http://127.0.0.1:8888/search?q=latest%20quantum%20computing%20breakthroughs&format=json&language=en'
      );
    });

    it('strips trailing slashes from baseUrl', () => {
      const url = buildSearxngUrl('AWS Bedrock', 'https://search.example.com///');
      expect(url).toBe(
        'https://search.example.com/search?q=AWS%20Bedrock&format=json&language=en'
      );
    });

    it('uses settingsStore default when baseUrl is not provided', () => {
      useSettingsStore.setState({ searxngUrl: 'http://searxng.internal:8080' });
      const url = buildSearxngUrl('news today');
      expect(url).toBe('http://searxng.internal:8080/search?q=news%20today&format=json&language=en');
    });
  });

  describe('extractQueryKeywords', () => {
    it('filters out common stop words and retains key search terms', () => {
      const keywords = extractQueryKeywords('what is the current population of Sydney Australia?');
      expect(keywords).toContain('current');
      expect(keywords).toContain('population');
      expect(keywords).toContain('sydney');
      expect(keywords).toContain('australia');
      expect(keywords).not.toContain('what');
      expect(keywords).not.toContain('is');
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('of');
    });
  });

  describe('filterRelevantResults', () => {
    it('reads title, url, and content fields, filtering out empty entries', () => {
      const raw = [
        { title: '', url: 'https://example.com/empty', content: 'No title' },
        { title: 'Valid 1', url: 'https://example.com/1', content: 'Good content about Sydney weather.' },
        { title: 'No content', url: 'https://example.com/2', content: '' },
      ];

      const filtered = filterRelevantResults('Sydney weather', raw);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Valid 1');
      expect(filtered[0].url).toBe('https://example.com/1');
      expect(filtered[0].content).toBe('Good content about Sydney weather.');
    });

    it('returns at most 3 most relevant results based on content matching', () => {
      const raw = [
        {
          title: 'Mars Rover Discoveries 2026',
          url: 'https://space.org/mars-rover',
          content: 'NASA rover discovers organic molecules and water ice beneath rocks on Mars surface.',
        },
        {
          title: 'Cooking with Marsala Wine',
          url: 'https://food.com/marsala',
          content: 'Classic chicken marsala with mushrooms and savory wine reduction.',
        },
        {
          title: 'Mars Exploration Timeline',
          url: 'https://space.org/timeline',
          content: 'A comprehensive history of rovers and orbiters exploring the surface of Mars.',
        },
        {
          title: 'Mars Atmospheric Pressure Study',
          url: 'https://astronomy.edu/mars-atmosphere',
          content: 'Detailed spectroscopic analysis of Mars thin carbon dioxide atmosphere.',
        },
        {
          title: 'Mars Chocolate Factory',
          url: 'https://snacks.com/mars',
          content: 'Candy bars and sweet confection manufacturing processes.',
        },
      ];

      const filtered = filterRelevantResults('Mars rover surface exploration', raw, 3);
      expect(filtered.length).toBeLessThanOrEqual(3);
      expect(filtered.length).toBeGreaterThanOrEqual(1);
      // Top result should be the rover discoveries
      expect(filtered[0].title).toBe('Mars Rover Discoveries 2026');
      // Irrelevant candy/cooking results should not be top ranked
      expect(filtered.some((f) => f.title.includes('Marsala'))).toBe(false);
    });

    it('returns empty array when results are empty or irrelevant', () => {
      const filtered = filterRelevantResults('superconductors', []);
      expect(filtered).toEqual([]);

      const irrelevant = [
        { title: 'Baking Bread', url: 'https://bake.com', content: 'Flour, yeast, water, and salt.' },
      ];
      const filteredIrrelevant = filterRelevantResults('superconductors quantum computing', irrelevant);
      expect(filteredIrrelevant).toEqual([]);
    });
  });

  describe('formatSearchContext', () => {
    it('concatenates 1-3 results into formatted context', () => {
      const results = [
        { title: 'Title A', url: 'https://a.com', content: 'Content A' },
        { title: 'Title B', url: 'https://b.com', content: 'Content B' },
      ];
      const context = formatSearchContext(results);
      expect(context).toContain('[Result 1]');
      expect(context).toContain('Title: Title A');
      expect(context).toContain('URL: https://a.com');
      expect(context).toContain('Content: Content A');
      expect(context).toContain('[Result 2]');
      expect(context).toContain('Content: Content B');
    });

    it('returns empty string if results array is empty', () => {
      expect(formatSearchContext([])).toBe('');
    });
  });

  describe('searchSearxng API Execution', () => {
    it('executes GET request to SearXNG and returns formatted context and sources', async () => {
      const mockResponse = {
        query: 'australia election date',
        number_of_results: 2,
        results: [
          {
            title: 'Australian Federal Election Information',
            url: 'https://aec.gov.au/election',
            content: 'The next Australian federal election timetable, voter registration, and key dates.',
          },
          {
            title: 'Election Analysis 2026',
            url: 'https://news.com.au/politics',
            content: 'In-depth polling and candidate overview for the upcoming election in Australia.',
          },
        ],
      };

      let capturedUrl = '';
      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        capturedUrl = String(url);
        return {
          ok: true,
          status: 200,
          json: async () => mockResponse,
        };
      });

      const res = await searchSearxng('Australia federal election');
      expect(capturedUrl).toContain('/search?q=Australia%20federal%20election&format=json&language=en');
      expect(res.success).toBe(true);
      expect(res.results).toHaveLength(2);
      expect(res.context).toContain('[Result 1]');
      expect(res.context).toContain('Australian Federal Election Information');
      expect(res.context).toContain('URL: https://aec.gov.au/election');
    });

    it('informs user that no reliable information was found if results are empty or irrelevant without fabricating', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      });

      const res = await searchSearxng('unknown obscure event');
      expect(res.success).toBe(false);
      expect(res.context).toBe('');
      expect(res.message).toBe('No reliable information was found.');
    });

    it('handles network failure gracefully without throwing and does not fabricate', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused to SearXNG'));

      const res = await searchSearxng('test query');
      expect(res.success).toBe(false);
      expect(res.context).toBe('');
      expect(res.message).toBe('No reliable information was found.');
    });
  });

  describe('toolRegistry Integration', () => {
    it('executes searxng_search via executeAgentTool', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              title: 'Tauri v2 Features',
              url: 'https://v2.tauri.app',
              content: 'Tauri 2.0 introduces multi-webview support and enhanced security permissions.',
            },
          ],
        }),
      });

      const output = await executeAgentTool('searxng_search', { query: 'Tauri v2 features' });
      expect(output).toContain('Web Search Context:');
      expect(output).toContain('Tauri 2.0 introduces multi-webview support');
      expect(output).toContain('Sources:');
      expect(output).toContain('[Tauri v2 Features](https://v2.tauri.app)');
    });

    it('executes search_web with platform="searxng" via executeAgentTool', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              title: 'AWS Bedrock Nova Micro',
              url: 'https://aws.amazon.com/bedrock/nova',
              content: 'Amazon Nova Micro provides ultra-low latency text generation at low cost.',
            },
          ],
        }),
      });

      const output = await executeAgentTool('search_web', {
        query: 'AWS Bedrock Nova Micro pricing',
        platform: 'searxng',
      });
      expect(output).toContain('Web Search Context:');
      expect(output).toContain('Amazon Nova Micro provides ultra-low latency');
      expect(output).toContain('https://aws.amazon.com/bedrock/nova');
    });

    it('returns "No reliable information was found." when search returns empty results', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      });

      const output = await executeAgentTool('searxng_search', { query: 'xyz nonexistent 987' });
      expect(output).toBe('No reliable information was found.');
    });
  });

  describe('OOP Architecture: SearchResultViewModel & Information Hiding', () => {
    it('encapsulates raw results and projects only essential view data', () => {
      const raw = [
        {
          title: 'Official Docs & Specs',
          url: 'https://subdomain.developer.apple.com/documentation/webkit?param=123#anchor',
          content: 'Detailed guidelines and specifications for modern desktop web development and security.',
        },
      ];

      const vm = SearchResultViewModel.create('apple webkit docs', raw);
      expect(vm.hasResults).toBe(true);
      expect(vm.count).toBe(1);
      expect(vm.summary).toBe('Found 1 relevant source.');

      // Information hiding: user sees clean domain and concise excerpt, not URL query params or raw schemas
      const essential = vm.essentialSources;
      expect(essential).toHaveLength(1);
      expect(essential[0].domain).toBe('subdomain.developer.apple.com');
      expect(essential[0].title).toBe('Official Docs & Specs');
      expect(essential[0].url).toBe(raw[0].url);
      expect(essential[0].snippet).toBe(raw[0].content);

      // Presentation model contract
      const pres = vm.toPresentation();
      expect(pres.hasResults).toBe(true);
      expect(pres.count).toBe(1);
      expect(pres.sources[0].domain).toBe('subdomain.developer.apple.com');
    });

    it('reconstitutes essential view model from raw LLM output, hiding internal prompt formatting', () => {
      const rawOutput = `Web Search Context:
[Result 1]
Title: Australian Federal Election Information
URL: https://aec.gov.au/election
Content: The next Australian federal election timetable, voter registration, and key dates.

[Result 2]
Title: Election Analysis 2026
URL: https://news.com.au/politics
Content: In-depth polling and candidate overview for the upcoming election in Australia.

Sources:
1. [Australian Federal Election Information](https://aec.gov.au/election)
2. [Election Analysis 2026](https://news.com.au/politics)`;

      const vm = SearchResultViewModel.fromAny(rawOutput, 'Australia election');
      expect(vm).not.toBeNull();
      expect(vm?.hasResults).toBe(true);
      expect(vm?.count).toBe(2);

      const sources = vm?.essentialSources;
      expect(sources?.[0].domain).toBe('aec.gov.au');
      expect(sources?.[0].title).toBe('Australian Federal Election Information');
      expect(sources?.[1].domain).toBe('news.com.au');
      expect(sources?.[1].title).toBe('Election Analysis 2026');
    });

    it('creates an empty view model when no reliable information is found', () => {
      const vm = SearchResultViewModel.empty('obscure topic');
      expect(vm.hasResults).toBe(false);
      expect(vm.count).toBe(0);
      expect(vm.essentialSources).toHaveLength(0);
      expect(vm.summary).toBe('No reliable information was found.');
      expect(vm.toToolOutput()).toBe('No reliable information was found.');
    });
  });

  describe('OOP Architecture: SearxngSearchService', () => {
    it('implements IWebSearchService contract and returns SearchResultViewModel', async () => {
      const service = new SearxngSearchService();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              title: 'Clean Architecture in TypeScript',
              url: 'https://martinfowler.com/articles/architecture.html',
              content: 'Principles of clean architecture and information hiding in modern software systems.',
            },
          ],
        }),
      });

      const vm = await service.search('clean architecture');
      expect(vm).toBeInstanceOf(SearchResultViewModel);
      expect(vm.hasResults).toBe(true);
      expect(vm.essentialSources[0].domain).toBe('martinfowler.com');
      expect(vm.essentialSources[0].title).toBe('Clean Architecture in TypeScript');
    });

    it('delegates to singleton searxngSearchService', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              title: 'Tauri Framework',
              url: 'https://tauri.app',
              content: 'Build smaller, faster, and more secure desktop applications with web frontend.',
            },
          ],
        }),
      });

      const vm = await searxngSearchService.search('Tauri');
      expect(vm.hasResults).toBe(true);
      expect(vm.essentialSources[0].domain).toBe('tauri.app');
    });
  });
});
