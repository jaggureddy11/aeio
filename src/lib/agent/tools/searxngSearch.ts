import { useSettingsStore } from '../../../stores/settingsStore';

export interface SearxngResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
  engine?: string;
}

export interface SearxngSearchResponse {
  query?: string;
  number_of_results?: number;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    snippet?: string;
    score?: number;
    engine?: string;
  }>;
}

export interface SearxngSearchResult {
  success: boolean;
  query: string;
  results: SearxngResultItem[];
  context: string;
  message?: string;
}

/**
 * Essential data contract for user-facing search sources.
 * Information Hiding: Exposes only essential user fields, hiding internal
 * relevance scores, engine identifiers, raw HTML markup, and tokenizer internals.
 */
export interface IEssentialSource {
  readonly title: string;
  readonly domain: string;
  readonly url: string;
  readonly snippet: string;
}

/**
 * Presentation contract for the application UI.
 */
export interface IEssentialSearchPresentation {
  readonly query: string;
  readonly count: number;
  readonly sources: IEssentialSource[];
  readonly hasResults: boolean;
  readonly summary: string;
}

export interface ISearchOptions {
  searxngUrl?: string;
  maxResults?: number;
  timeoutMs?: number;
}

/**
 * Abstract service contract for web search providers.
 */
export interface IWebSearchService {
  search(query: string, options?: ISearchOptions): Promise<SearchResultViewModel>;
  execute(query: string, options?: ISearchOptions): Promise<SearxngSearchResult>;
}

/**
 * SearchResultViewModel
 * 
 * Follows OOP Abstraction & Information Hiding:
 * - Internal items and query are encapsulated in private fields.
 * - Exposes only essential data required for user perception via getters (`essentialSources`, `hasResults`, `summary`).
 * - Encapsulates raw LLM prompt formatting into `toContextForLlm()`.
 * - Hides low-level transport errors and technical schemas from the visual presentation layer.
 */
export class SearchResultViewModel {
  readonly #query: string;
  readonly #items: readonly SearxngResultItem[];
  readonly #success: boolean;
  readonly #message: string;

  constructor(
    query: string,
    items: SearxngResultItem[],
    success: boolean,
    message?: string
  ) {
    this.#query = query;
    this.#items = Object.freeze([...items]);
    this.#success = success;
    this.#message =
      message ||
      (success && items.length > 0
        ? `Found ${items.length} relevant source${items.length === 1 ? '' : 's'}.`
        : 'No reliable information was found.');
  }

  get query(): string {
    return this.#query;
  }

  get success(): boolean {
    return this.#success;
  }

  get hasResults(): boolean {
    return this.#success && this.#items.length > 0;
  }

  get count(): number {
    return this.#items.length;
  }

  get summary(): string {
    return this.#message;
  }

  get rawResults(): ReadonlyArray<SearxngResultItem> {
    return this.#items;
  }

  /**
   * Information Hiding: Projects raw internal results into clean essential data.
   * Extracts clean domain hostname, sanitizes titles, and generates concise excerpts.
   */
  get essentialSources(): IEssentialSource[] {
    return this.#items.map((item) => {
      let domain = '';
      try {
        const parsed = new URL(item.url);
        domain = parsed.hostname.replace(/^www\./, '');
      } catch {
        domain = item.url.split('/')[2] || item.url;
      }

      const cleanSnippet =
        item.content.length > 180
          ? `${item.content.slice(0, 177).trim()}...`
          : item.content;

      return {
        title: item.title,
        domain,
        url: item.url,
        snippet: cleanSnippet,
      };
    });
  }

  /**
   * Provides the structured presentation model for UI components.
   */
  toPresentation(): IEssentialSearchPresentation {
    return {
      query: this.#query,
      count: this.count,
      sources: this.essentialSources,
      hasResults: this.hasResults,
      summary: this.summary,
    };
  }

  /**
   * Generates concatenated context for LLM reasoning while keeping it encapsulated.
   */
  toContextForLlm(): string {
    if (this.#items.length === 0) return '';
    return this.#items
      .map(
        (r, idx) =>
          `[Result ${idx + 1}]\nTitle: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`
      )
      .join('\n\n');
  }

  /**
   * Full tool output string incorporating LLM context and source citations.
   */
  toToolOutput(): string {
    if (!this.hasResults) {
      return this.#message;
    }
    const context = this.toContextForLlm();
    const citations = this.#items
      .map((r, i) => `${i + 1}. [${r.title}](${r.url})`)
      .join('\n');
    return `Web Search Context:\n${context}\n\nSources:\n${citations}`;
  }

  /**
   * Backward-compatible legacy result object.
   */
  toLegacyResult(): SearxngSearchResult {
    return {
      success: this.#success,
      query: this.#query,
      results: [...this.#items],
      context: this.toContextForLlm(),
      message: this.#message,
    };
  }

  /**
   * Factory method for creating an empty result view model.
   */
  static empty(
    query: string,
    message = 'No reliable information was found.'
  ): SearchResultViewModel {
    return new SearchResultViewModel(query, [], false, message);
  }

  /**
   * Factory method for creating a populated result view model.
   */
  static create(
    query: string,
    items: SearxngResultItem[],
    message?: string
  ): SearchResultViewModel {
    return new SearchResultViewModel(query, items, items.length > 0, message);
  }

  /**
   * Reconstitutes essential data from any raw result (string output or object),
   * allowing the application UI to display only essential data while hiding internal text blobs.
   */
  static fromAny(data: any, queryFallback = ''): SearchResultViewModel | null {
    if (!data) return null;
    if (data instanceof SearchResultViewModel) return data;

    if (typeof data === 'string') {
      return SearchResultViewModel.fromRawOutput(data, queryFallback);
    }

    if (typeof data === 'object') {
      if (Array.isArray(data.results)) {
        return SearchResultViewModel.create(
          data.query || queryFallback,
          data.results,
          data.message
        );
      }
      if (Array.isArray(data.sources)) {
        return SearchResultViewModel.create(
          data.query || queryFallback,
          data.sources.map((s: any) => ({
            title: s.title || '',
            url: s.url || '',
            content: s.snippet || s.content || '',
          }))
        );
      }
    }

    return null;
  }

  /**
   * Reconstitutes a SearchResultViewModel from a formatted tool output string.
   */
  static fromRawOutput(
    raw: string,
    queryFallback = ''
  ): SearchResultViewModel | null {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();

    if (trimmed === 'No reliable information was found.') {
      return SearchResultViewModel.empty(queryFallback, trimmed);
    }

    if (!trimmed.includes('Web Search Context:') && !trimmed.includes('[Result 1]')) {
      return null;
    }

    const items: SearxngResultItem[] = [];
    const resultBlocks = trimmed.split(/\[Result \d+\]/g).slice(1);

    for (const block of resultBlocks) {
      const titleMatch = block.match(/Title:\s*(.+)/i);
      const urlMatch = block.match(/URL:\s*(.+)/i);
      const contentMatch = block.match(
        /Content:\s*([\s\S]*?)(?=\n\n(?:Sources:|\[Result|\b\d+\.\s*\[)|$)/i
      );

      const title = titleMatch ? titleMatch[1].trim() : '';
      const url = urlMatch ? urlMatch[1].trim() : '';
      const content = contentMatch ? contentMatch[1].trim() : '';

      if (title && url) {
        items.push({ title, url, content });
      }
    }

    if (items.length === 0) return null;
    return SearchResultViewModel.create(queryFallback, items);
  }
}

/**
 * SearxngSearchService
 * 
 * Encapsulated concrete implementation of IWebSearchService.
 * Enforces strict OOP Information Hiding:
 * - Private fields (#defaultTimeoutMs, #stopWords) protect configuration state.
 * - Private methods (#buildUrl, #extractKeywords, #sanitizeRawItems, #filterByRelevance)
 *   hide the complex mechanics of keyword sanitization, stop-word reduction, and scoring.
 * - Consumers interact exclusively through the high-level `search()` and `execute()` abstractions.
 */
export class SearxngSearchService implements IWebSearchService {
  readonly #defaultTimeoutMs: number;
  readonly #stopWords: Set<string>;

  constructor(timeoutMs = 10000) {
    this.#defaultTimeoutMs = timeoutMs;
    this.#stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'were', 'will', 'with', 'what', 'when', 'where', 'who',
      'why', 'how', 'can', 'could', 'should', 'would', 'do', 'does', 'did',
      'tell', 'me', 'about', 'find', 'search', 'query',
    ]);
  }

  #getBaseUrl(customUrl?: string): string {
    const root = (
      customUrl ||
      useSettingsStore.getState().searxngUrl ||
      'http://localhost:8080'
    )
      .trim()
      .replace(/\/+$/, '');
    return root;
  }

  #buildUrl(query: string, baseUrl?: string): string {
    const root = this.#getBaseUrl(baseUrl);
    const encodedQuery = encodeURIComponent(query.trim());
    return `${root}/search?q=${encodedQuery}&format=json&language=en`;
  }

  #extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !this.#stopWords.has(w));
  }

  #sanitizeRawItems(
    rawResults: Array<{ title?: string; url?: string; content?: string; snippet?: string }>
  ): SearxngResultItem[] {
    if (!Array.isArray(rawResults)) return [];
    const validItems: SearxngResultItem[] = [];

    for (const item of rawResults) {
      const title = (item.title || '').trim();
      const url = (item.url || '').trim();
      const content = (item.content || item.snippet || '').trim();

      if (title && url && content) {
        validItems.push({ title, url, content });
      }
    }

    return validItems;
  }

  #filterByRelevance(
    query: string,
    validItems: SearxngResultItem[],
    maxResults = 3
  ): SearxngResultItem[] {
    if (validItems.length === 0) return [];
    const keywords = this.#extractKeywords(query);

    const scored = validItems.map((item) => {
      let score = 0;
      if (keywords.length === 0) {
        score = 1;
      } else {
        for (const kw of keywords) {
          const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          if (regex.test(item.title)) score += 3;
          if (regex.test(item.content)) score += 2;
        }
      }
      return { item, score };
    });

    const relevantScored =
      keywords.length > 0
        ? scored.filter((s) => s.score > 0)
        : scored;

    if (relevantScored.length === 0) return [];
    relevantScored.sort((a, b) => b.score - a.score);

    const topCount = Math.max(1, Math.min(maxResults, 3));
    return relevantScored.slice(0, topCount).map((s) => s.item);
  }

  /**
   * Executes a search query, hiding internal network and ranking mechanics,
   * returning a SearchResultViewModel encapsulating essential data.
   */
  async search(
    query: string,
    options?: ISearchOptions
  ): Promise<SearchResultViewModel> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return SearchResultViewModel.empty('', 'No reliable information was found.');
    }

    const url = this.#buildUrl(cleanQuery, options?.searxngUrl);
    const timeout = options?.timeoutMs ?? this.#defaultTimeoutMs;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        return SearchResultViewModel.empty(
          cleanQuery,
          'No reliable information was found.'
        );
      }

      const data: SearxngSearchResponse = await response.json();
      const rawResults = data.results || [];
      const sanitized = this.#sanitizeRawItems(rawResults);
      const filtered = this.#filterByRelevance(
        cleanQuery,
        sanitized,
        options?.maxResults ?? 3
      );

      if (filtered.length === 0) {
        return SearchResultViewModel.empty(
          cleanQuery,
          'No reliable information was found.'
        );
      }

      return SearchResultViewModel.create(cleanQuery, filtered);
    } catch {
      return SearchResultViewModel.empty(
        cleanQuery,
        'No reliable information was found.'
      );
    }
  }

  /**
   * Executes search returning the legacy result contract.
   */
  async execute(
    query: string,
    options?: ISearchOptions
  ): Promise<SearxngSearchResult> {
    const vm = await this.search(query, options);
    return vm.toLegacyResult();
  }

  // Public facade methods for testing and backward compatibility:
  buildUrl(query: string, baseUrl?: string): string {
    return this.#buildUrl(query, baseUrl);
  }

  extractKeywords(query: string): string[] {
    return this.#extractKeywords(query);
  }

  filterRelevant(
    query: string,
    rawResults: Array<{ title?: string; url?: string; content?: string; snippet?: string }>,
    maxResults = 3
  ): SearxngResultItem[] {
    const sanitized = this.#sanitizeRawItems(rawResults);
    return this.#filterByRelevance(query, sanitized, maxResults);
  }
}

/**
 * Global singleton search service instance.
 */
export const searxngSearchService = new SearxngSearchService();

// Standalone backward-compatible facade functions:
export function buildSearxngUrl(query: string, baseUrl?: string): string {
  return searxngSearchService.buildUrl(query, baseUrl);
}

export function extractQueryKeywords(query: string): string[] {
  return searxngSearchService.extractKeywords(query);
}

export function filterRelevantResults(
  query: string,
  rawResults: Array<{ title?: string; url?: string; content?: string; snippet?: string }>,
  maxResults = 3
): SearxngResultItem[] {
  return searxngSearchService.filterRelevant(query, rawResults, maxResults);
}

export function formatSearchContext(results: SearxngResultItem[]): string {
  const vm = SearchResultViewModel.create('', results);
  return vm.toContextForLlm();
}

export async function searchSearxng(
  query: string,
  options?: ISearchOptions
): Promise<SearxngSearchResult> {
  return searxngSearchService.execute(query, options);
}
