import { fetchUrl } from '../../ipc';

export interface PageLink {
  text: string;
  url: string;
  isExternal: boolean;
}

export interface BrowsePageResult {
  url: string;
  title: string;
  description: string;
  markdown: string;
  wordCount: number;
  links: PageLink[];
}

/**
 * Resolves a relative URL against a base URL.
 */
function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

/**
 * Decodes common HTML entities into their unicode representations.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

/**
 * Strips noise, script tags, style sheets, and extracts readable Markdown from raw HTML.
 */
export function htmlToCleanMarkdown(html: string, baseUrl: string): {
  title: string;
  description: string;
  markdown: string;
  links: PageLink[];
} {
  // 1. Extract Title
  let title = '';
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim());
  }

  // 2. Extract Meta Description
  let description = '';
  const metaDescMatch = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html) ||
                        /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html);
  if (metaDescMatch) {
    description = decodeHtmlEntities(metaDescMatch[1].trim());
  }

  // 3. Extract Links before stripping
  const links: PageLink[] = [];
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  const baseHost = (() => {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return '';
    }
  })();

  while ((match = linkRegex.exec(html)) !== null && links.length < 50) {
    const rawHref = match[1].trim();
    if (
      !rawHref ||
      rawHref.startsWith('#') ||
      rawHref.startsWith('javascript:') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:')
    ) {
      continue;
    }

    const resolved = resolveUrl(baseUrl, rawHref);
    const linkText = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!linkText) continue;

    let isExternal = false;
    try {
      isExternal = new URL(resolved).hostname !== baseHost;
    } catch {
      isExternal = true;
    }

    if (!links.some((l) => l.url === resolved)) {
      links.push({
        text: linkText.slice(0, 80),
        url: resolved,
        isExternal,
      });
    }
  }

  // 4. Strip non-content tags: scripts, styles, SVGs, iframes, comments, nav, footer
  let clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '');

  // 5. Convert Headers
  clean = clean.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  clean = clean.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  clean = clean.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  clean = clean.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  clean = clean.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  clean = clean.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  // 6. Convert Code Blocks
  clean = clean.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  clean = clean.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // 7. Convert Lists
  clean = clean.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
  clean = clean.replace(/<\/(ul|ol)>/gi, '\n');

  // 8. Convert Paragraphs and line breaks
  clean = clean.replace(/<br\s*\/?>/gi, '\n');
  clean = clean.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  clean = clean.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n');

  // 9. Convert Strong & Emphasis
  clean = clean.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  clean = clean.replace(/<(i|em)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');

  // 10. Strip remaining HTML tags
  clean = clean.replace(/<[^>]+>/g, '');

  // 11. Decode common HTML entities
  clean = clean
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');

  // 12. Normalize multiple empty lines and excessive spaces
  const lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l, idx, arr) => !(l === '' && arr[idx - 1] === ''));

  let markdown = lines.join('\n').trim();

  // Limit output to 25,000 characters for token efficiency
  const MAX_CHARS = 25_000;
  if (markdown.length > MAX_CHARS) {
    markdown = markdown.slice(0, MAX_CHARS) + `\n\n[Content truncated at 25KB (${markdown.length} total chars)]`;
  }

  return {
    title,
    description,
    markdown,
    links,
  };
}

/**
 * Fetches and parses a web page into clean, structured Markdown.
 */
export async function browsePage(url: string): Promise<BrowsePageResult> {
  const rawHtml = await fetchUrl(url);
  const parsed = htmlToCleanMarkdown(rawHtml, url);
  const wordCount = parsed.markdown.split(/\s+/).filter(Boolean).length;

  return {
    url,
    title: parsed.title,
    description: parsed.description,
    markdown: parsed.markdown,
    wordCount,
    links: parsed.links,
  };
}

/**
 * Extracts and filters all hyperlinks from a web page.
 */
export async function extractPageLinks(url: string, sameDomainOnly = false): Promise<PageLink[]> {
  const page = await browsePage(url);
  if (sameDomainOnly) {
    return page.links.filter((l) => !l.isExternal);
  }
  return page.links;
}
