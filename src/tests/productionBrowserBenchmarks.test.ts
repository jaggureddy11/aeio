import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities, htmlToCleanMarkdown } from '../lib/agent/tools/browserTool';
import { extractInteractiveElements } from '../lib/agent/tools/visualBrowserTool';

describe('Production Browser Parsing & DOM Normalization Suite (50 Tests)', () => {
  // --- 1. Entity Decoding (10 tests) ---
  const entityCases = [
    { input: '&nbsp;&nbsp;Hello', expected: '  Hello', desc: 'non-breaking space' },
    { input: 'Cats &amp; Dogs', expected: 'Cats & Dogs', desc: 'ampersand' },
    { input: '&lt;div&gt;', expected: '<div>', desc: 'angle brackets' },
    { input: '&quot;Aeio Desktop&quot;', expected: '"Aeio Desktop"', desc: 'double quotes' },
    { input: 'It&#39;s running', expected: "It's running", desc: 'single quote' },
    { input: 'Section 1 &mdash; Overview', expected: 'Section 1 — Overview', desc: 'em dash' },
    { input: '2024 &ndash; 2026', expected: '2024 – 2026', desc: 'en dash' },
    { input: '&lt;code&gt;&amp;nbsp;&lt;/code&gt;', expected: '<code> </code>', desc: 'nested entities' },
    { input: 'Plain text with no entities', expected: 'Plain text with no entities', desc: 'plain text' },
    { input: '&quot;&lt;safe&gt;&quot;', expected: '"<safe>"', desc: 'quote and tags' },
  ];

  entityCases.forEach(({ input, expected, desc }, idx) => {
    it(`Entity Case ${idx + 1}/10: decodes ${desc}`, () => {
      expect(decodeHtmlEntities(input)).toBe(expected);
    });
  });

  // --- 2. HTML to Clean Markdown Structure (20 tests) ---
  const markdownCases = [
    { html: '<h1>Main Header</h1>', expectedContent: '# Main Header', desc: 'h1 conversion' },
    { html: '<h2>Secondary Section</h2>', expectedContent: '## Secondary Section', desc: 'h2 conversion' },
    { html: '<h3>Subsection Title</h3>', expectedContent: '### Subsection Title', desc: 'h3 conversion' },
    { html: '<h4>Fourth Level</h4>', expectedContent: '#### Fourth Level', desc: 'h4 conversion' },
    { html: '<h5>Fifth Level</h5>', expectedContent: '##### Fifth Level', desc: 'h5 conversion' },
    { html: '<h6>Sixth Level</h6>', expectedContent: '###### Sixth Level', desc: 'h6 conversion' },
    { html: '<p>First paragraph.</p><p>Second paragraph.</p>', expectedContent: 'First paragraph.\n\nSecond paragraph.', desc: 'paragraphs' },
    { html: '<b>Bold text</b> and <strong>strong text</strong>', expectedContent: '**Bold text** and **strong text**', desc: 'bold and strong' },
    { html: '<i>Italic text</i> and <em>emphasized text</em>', expectedContent: '*Italic text* and *emphasized text*', desc: 'italics and emphasis' },
    { html: '<pre><code>const a = 10;</code></pre>', expectedContent: '```\nconst a = 10;\n```', desc: 'code block' },
    { html: 'Use <code>inline code</code> here', expectedContent: 'Use `inline code` here', desc: 'inline code' },
    { html: '<ul><li>Apple</li><li>Orange</li></ul>', expectedContent: '- Apple\n- Orange', desc: 'unordered list' },
    { html: '<ol><li>Step 1</li><li>Step 2</li></ol>', expectedContent: '- Step 1\n- Step 2', desc: 'ordered list' },
    { html: '<blockquote>Note on safety</blockquote>', expectedContent: '> Note on safety', desc: 'blockquote' },
    { html: 'Text with<br>break line', expectedContent: 'Text with\nbreak line', desc: 'break line' },
    { html: '<script>alert("evil")</script><p>Clean content</p>', expectedContent: 'Clean content', desc: 'strips script' },
    { html: '<style>body { color: red; }</style><p>Styled body</p>', expectedContent: 'Styled body', desc: 'strips style' },
    { html: '<noscript>Enable JS</noscript><p>Real app</p>', expectedContent: 'Real app', desc: 'strips noscript' },
    { html: '<nav><a href="/home">Home</a></nav><main><p>Main body</p></main>', expectedContent: 'Main body', desc: 'strips navigation' },
    { html: '<footer>Copyright 2026</footer><p>Live data</p>', expectedContent: 'Live data', desc: 'strips footer' },
  ];

  markdownCases.forEach(({ html, expectedContent, desc }, idx) => {
    it(`Markdown Case ${idx + 1}/20: converts ${desc}`, () => {
      const res = htmlToCleanMarkdown(html, 'https://example.com');
      expect(res.markdown).toContain(expectedContent);
    });
  });

  // --- 3. Interactive Elements Extraction (20 tests) ---
  const elementCases = [
    {
      html: '<button id="submit-btn">Submit Request</button>',
      expectedTag: 'button',
      expectedText: 'Submit Request',
      expectedSelector: '#submit-btn',
      desc: 'button with ID',
    },
    {
      html: '<button name="checkout">Proceed to Checkout</button>',
      expectedTag: 'button',
      expectedText: 'Proceed to Checkout',
      expectedSelector: 'button[name="checkout"]',
      desc: 'button with name',
    },
    {
      html: '<button>Save Changes</button>',
      expectedTag: 'button',
      expectedText: 'Save Changes',
      expectedSelector: 'button:contains("Save Changes")',
      desc: 'button with text only',
    },
    {
      html: '<input type="text" id="username-input" placeholder="Enter username" />',
      expectedTag: 'input',
      expectedText: 'Enter username',
      expectedSelector: '#username-input',
      desc: 'text input with placeholder and id',
    },
    {
      html: '<input type="email" name="user_email" />',
      expectedTag: 'input',
      expectedText: 'user_email',
      expectedSelector: 'input[name="user_email"]',
      desc: 'email input with name',
    },
    {
      html: '<input type="password" id="pass-field" />',
      expectedTag: 'input',
      expectedText: 'pass-field',
      expectedSelector: '#pass-field',
      desc: 'password input',
    },
    {
      html: '<input type="search" placeholder="Search documentation..." />',
      expectedTag: 'input',
      expectedText: 'Search documentation...',
      expectedSelector: 'input[type="search"]',
      desc: 'search input',
    },
    {
      html: '<input type="checkbox" id="agree-terms" />',
      expectedTag: 'input',
      expectedText: 'agree-terms',
      expectedSelector: '#agree-terms',
      desc: 'checkbox input',
    },
    {
      html: '<input type="hidden" name="csrf" value="secret" />',
      expectedCount: 0,
      desc: 'ignores hidden input',
    },
    {
      html: '<a href="/docs" id="docs-link">Documentation</a>',
      expectedTag: 'a',
      expectedText: 'Documentation',
      expectedSelector: 'a[href="/docs"]',
      desc: 'link with ID and href',
    },
    {
      html: '<a href="/pricing">View Pricing Plans</a>',
      expectedTag: 'a',
      expectedText: 'View Pricing Plans',
      expectedSelector: 'a[href="/pricing"]',
      desc: 'link with text',
    },
    {
      html: '<button id="btn-1">Button 1</button><button id="btn-2">Button 2</button>',
      expectedCount: 2,
      desc: 'multiple buttons',
    },
    {
      html: '<input type="text" id="inp-1" /><input type="text" id="inp-2" />',
      expectedCount: 2,
      desc: 'multiple inputs',
    },
    {
      html: '<a href="/a">Link A</a><a href="/b">Link B</a>',
      expectedCount: 2,
      desc: 'multiple links',
    },
    {
      html: '<a href="#top">Back to top</a>',
      expectedCount: 0,
      desc: 'skips anchor fragment links',
    },
    {
      html: '<a href="javascript:void(0)">Do nothing</a>',
      expectedCount: 0,
      desc: 'skips javascript void links',
    },
    {
      html: '<button id="upload">Upload &amp; Process</button>',
      expectedTag: 'button',
      expectedText: 'Upload & Process',
      desc: 'decodes entities in button text',
    },
    {
      html: '<input type="number" id="quantity" placeholder="Qty &gt; 0" />',
      expectedTag: 'input',
      expectedText: 'Qty > 0',
      desc: 'decodes entities in placeholder',
    },
    {
      html: '<button id="delete-btn"><span>Delete Item</span></button>',
      expectedTag: 'button',
      expectedText: 'Delete Item',
      desc: 'extracts text inside nested span',
    },
    {
      html: '<div><span>Plain static text</span></div>',
      expectedCount: 0,
      desc: 'ignores non-interactive static containers',
    },
  ];

  elementCases.forEach((c: any, idx) => {
    it(`DOM Case ${idx + 1}/20: extracts ${c.desc}`, () => {
      const elements = extractInteractiveElements(c.html, 'https://example.com');
      if (typeof c.expectedCount === 'number') {
        expect(elements).toHaveLength(c.expectedCount);
      } else {
        expect(elements.length).toBeGreaterThan(0);
        const first = elements[0];
        expect(first.tag).toBe(c.expectedTag);
        expect(first.text).toBe(c.expectedText);
        if (c.expectedSelector) {
          expect(first.selector).toBe(c.expectedSelector);
        }
      }
    });
  });
});
