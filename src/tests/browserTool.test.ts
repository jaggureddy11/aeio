import { describe, it, expect, vi } from 'vitest';
import { htmlToCleanMarkdown, browsePage, extractPageLinks } from '../lib/agent/tools/browserTool';

vi.mock('../lib/ipc', () => ({
  fetchUrl: vi.fn(async (url: string) => {
    if (url.includes('example.com')) {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Example Domain &amp; Documentation</title>
            <meta name="description" content="This domain is for use in illustrative examples.">
            <style>body { font-family: sans-serif; }</style>
            <script>console.log("tracking script");</script>
          </head>
          <body>
            <nav><a href="/home">Home</a><a href="/about">About</a></nav>
            <h1>Welcome to Example</h1>
            <p>This is a <b>first</b> paragraph with <a href="/docs/intro">documentation link</a> and an <a href="https://external.org/info">external reference</a>.</p>
            <h2>Installation</h2>
            <pre><code>npm install aeio-core</code></pre>
            <ul>
              <li>Lightweight native shell</li>
              <li>Privacy-first vector memory</li>
            </ul>
            <footer>Copyright 2026 Example Corp</footer>
          </body>
        </html>
      `;
    }
    throw new Error('Not found');
  }),
}));

describe('browserTool - htmlToCleanMarkdown', () => {
  it('extracts page title and meta description correctly', () => {
    const raw = `
      <html>
        <head>
          <title>Deep Research Article &mdash; Aeio</title>
          <meta name="description" content="A comprehensive breakdown of agentic desktop workflows.">
        </head>
        <body><p>Hello world</p></body>
      </html>
    `;
    const result = htmlToCleanMarkdown(raw, 'https://aeio.ai/post/1');
    expect(result.title).toBe('Deep Research Article — Aeio');
    expect(result.description).toBe('A comprehensive breakdown of agentic desktop workflows.');
    expect(result.markdown).toContain('Hello world');
  });

  it('strips scripts, styles, navigation, footer and produces clean markdown', () => {
    const raw = `
      <div>
        <script>alert(1);</script>
        <style>.hide { display: none; }</style>
        <nav><a href="/">Nav Item</a></nav>
        <h1>Main Header</h1>
        <p>Paragraph with <strong>bold</strong> and <em>italic</em>.</p>
        <pre><code>const x = 42;</code></pre>
        <footer>Bottom footer</footer>
      </div>
    `;
    const result = htmlToCleanMarkdown(raw, 'https://aeio.ai');
    expect(result.markdown).not.toContain('alert(1)');
    expect(result.markdown).not.toContain('.hide');
    expect(result.markdown).not.toContain('Nav Item');
    expect(result.markdown).not.toContain('Bottom footer');
    expect(result.markdown).toContain('# Main Header');
    expect(result.markdown).toContain('**bold**');
    expect(result.markdown).toContain('*italic*');
    expect(result.markdown).toContain('const x = 42;');
  });

  it('resolves relative URLs and categorizes external links', () => {
    const raw = `
      <p>
        <a href="/api/v1">Internal API</a>
        <a href="https://github.com/jhmeel/bigfoot">External GitHub</a>
      </p>
    `;
    const result = htmlToCleanMarkdown(raw, 'https://aeio.ai/docs');
    expect(result.links).toHaveLength(2);
    expect(result.links[0].url).toBe('https://aeio.ai/api/v1');
    expect(result.links[0].isExternal).toBe(false);
    expect(result.links[1].url).toBe('https://github.com/jhmeel/bigfoot');
    expect(result.links[1].isExternal).toBe(true);
  });
});

describe('browserTool - browsePage and extractPageLinks', () => {
  it('browses page and generates structured browse result with word count', async () => {
    const result = await browsePage('https://example.com');
    expect(result.url).toBe('https://example.com');
    expect(result.title).toBe('Example Domain & Documentation');
    expect(result.description).toBe('This domain is for use in illustrative examples.');
    expect(result.wordCount).toBeGreaterThan(5);
    expect(result.markdown).toContain('# Welcome to Example');
    expect(result.markdown).toContain('npm install aeio-core');
  });

  it('extracts links filtering by sameDomainOnly when requested', async () => {
    const allLinks = await extractPageLinks('https://example.com', false);
    expect(allLinks.length).toBeGreaterThan(0);

    const internalOnly = await extractPageLinks('https://example.com', true);
    expect(internalOnly.every((l) => !l.isExternal)).toBe(true);
    expect(internalOnly.some((l) => l.url.includes('/docs/intro'))).toBe(true);
  });
});
