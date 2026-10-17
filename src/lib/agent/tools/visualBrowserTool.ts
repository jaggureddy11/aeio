import { fetchUrl, captureScreenData } from '../../ipc';
import { decodeHtmlEntities } from './browserTool';

export interface InteractiveElement {
  index: number;
  tag: string;
  type?: string;
  text: string;
  selector: string;
  name?: string;
  href?: string;
}

export interface VisualPageSnapshot {
  url: string;
  title: string;
  interactiveElements: InteractiveElement[];
  summary: string;
  screenshotBase64?: string;
  timestamp: number;
}

/**
 * Parses raw HTML into a structured list of actionable interactive elements.
 */
export function extractInteractiveElements(html: string, _baseUrl?: string): InteractiveElement[] {
  const elements: InteractiveElement[] = [];
  let currentIndex = 1;

  // 1. Buttons (<button>...</button>)
  const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let btnMatch: RegExpExecArray | null;
  while ((btnMatch = buttonRegex.exec(html)) !== null && elements.length < 40) {
    const attrs = btnMatch[1];
    const innerText = decodeHtmlEntities(btnMatch[2].replace(/<[^>]+>/g, '').trim());
    const idMatch = /id=["']([^"']*)["']/i.exec(attrs);
    const nameMatch = /name=["']([^"']*)["']/i.exec(attrs);

    const selector = idMatch ? `#${idMatch[1]}` : nameMatch ? `button[name="${nameMatch[1]}"]` : `button:contains("${innerText}")`;

    elements.push({
      index: currentIndex++,
      tag: 'button',
      text: innerText || 'Button',
      selector,
      name: nameMatch ? nameMatch[1] : undefined,
    });
  }

  // 2. Input fields (<input ...>)
  const inputRegex = /<input\b([^>]*)>/gi;
  let inputMatch: RegExpExecArray | null;
  while ((inputMatch = inputRegex.exec(html)) !== null && elements.length < 80) {
    const attrs = inputMatch[1];
    const typeMatch = /type=["']([^"']*)["']/i.exec(attrs);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text';
    if (type === 'hidden') continue;

    const idMatch = /id=["']([^"']*)["']/i.exec(attrs);
    const nameMatch = /name=["']([^"']*)["']/i.exec(attrs);
    const placeholderMatch = /placeholder=["']([^"']*)["']/i.exec(attrs);

    const label = decodeHtmlEntities(
      placeholderMatch ? placeholderMatch[1] : nameMatch ? nameMatch[1] : idMatch ? idMatch[1] : `${type} input`
    );
    const selector = idMatch ? `#${idMatch[1]}` : nameMatch ? `input[name="${nameMatch[1]}"]` : `input[type="${type}"]`;

    elements.push({
      index: currentIndex++,
      tag: 'input',
      type,
      text: label,
      selector,
      name: nameMatch ? nameMatch[1] : undefined,
    });
  }

  // 3. Primary Links (<a>...</a>)
  const linkRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null && elements.length < 120) {
    const attrs = linkMatch[1];
    const hrefMatch = /href=["']([^"']*)["']/i.exec(attrs);
    const href = hrefMatch ? hrefMatch[1].trim() : '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

    const text = decodeHtmlEntities(linkMatch[2].replace(/<[^>]+>/g, '').trim());
    if (!text || text.length < 2) continue;

    elements.push({
      index: currentIndex++,
      tag: 'a',
      text,
      selector: `a[href="${href}"]`,
      href,
    });
  }

  return elements;
}

/**
 * Inspects a webpage, maps its interactive DOM tree, and takes a visual screenshot if supported.
 */
export async function inspectInteractivePage(
  url: string,
  takeScreenshot: boolean = false
): Promise<VisualPageSnapshot> {
  const html = await fetchUrl(url);

  let title = '';
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim());
  }

  const interactiveElements = extractInteractiveElements(html, url);

  let screenshotBase64: string | undefined;
  if (takeScreenshot) {
    try {
      const screen = await captureScreenData();
      screenshotBase64 = screen.base64;
    } catch {
      // In headless or mock test environments, skip screenshot
    }
  }

  const summary = `Found ${interactiveElements.length} interactive elements on "${title || url}"`;

  return {
    url,
    title,
    interactiveElements,
    summary,
    screenshotBase64,
    timestamp: Date.now(),
  };
}

/**
 * Simulates clicking an interactive DOM element by index or selector.
 */
export async function clickBrowserElement(
  url: string,
  selectorOrIndex: string | number
): Promise<{ success: boolean; message: string; target: string; navigatedUrl?: string }> {
  const snapshot = await inspectInteractivePage(url, false);
  let targetElement: InteractiveElement | undefined;

  if (typeof selectorOrIndex === 'number') {
    targetElement = snapshot.interactiveElements.find((e) => e.index === selectorOrIndex);
  } else {
    const num = parseInt(selectorOrIndex, 10);
    if (!isNaN(num)) {
      targetElement = snapshot.interactiveElements.find((e) => e.index === num);
    } else {
      targetElement = snapshot.interactiveElements.find(
        (e) => e.selector.includes(selectorOrIndex) || e.text.toLowerCase().includes(selectorOrIndex.toLowerCase())
      );
    }
  }

  if (!targetElement) {
    return {
      success: false,
      message: `Element '${selectorOrIndex}' not found among ${snapshot.interactiveElements.length} page targets.`,
      target: String(selectorOrIndex),
    };
  }

  let navigatedUrl: string | undefined;
  if (targetElement.tag === 'a' && targetElement.href) {
    try {
      navigatedUrl = new URL(targetElement.href, url).href;
    } catch {
      navigatedUrl = targetElement.href;
    }
  }

  return {
    success: true,
    message: `Clicked ${targetElement.tag} [#${targetElement.index}] "${targetElement.text}"`,
    target: targetElement.selector,
    navigatedUrl,
  };
}

/**
 * Simulates filling a form input field by index or selector.
 */
export async function fillBrowserField(
  url: string,
  selectorOrIndex: string | number,
  value: string
): Promise<{ success: boolean; message: string; field: string; value: string }> {
  const snapshot = await inspectInteractivePage(url, false);
  let targetElement: InteractiveElement | undefined;

  if (typeof selectorOrIndex === 'number') {
    targetElement = snapshot.interactiveElements.find((e) => e.index === selectorOrIndex && e.tag === 'input');
  } else {
    const num = parseInt(selectorOrIndex, 10);
    if (!isNaN(num)) {
      targetElement = snapshot.interactiveElements.find((e) => e.index === num);
    } else {
      targetElement = snapshot.interactiveElements.find(
        (e) => e.selector.includes(selectorOrIndex) || e.text.toLowerCase().includes(selectorOrIndex.toLowerCase())
      );
    }
  }

  if (!targetElement) {
    return {
      success: false,
      message: `Input field '${selectorOrIndex}' not found.`,
      field: String(selectorOrIndex),
      value,
    };
  }

  return {
    success: true,
    message: `Filled input field [#${targetElement.index}] "${targetElement.text}" with "${value}"`,
    field: targetElement.selector,
    value,
  };
}

/**
 * Verifies that the page state transitioned as expected (e.g. contains confirmation text or target URL).
 */
export function verifyPageState(
  expectedSubstring: string,
  htmlOrText: string
): { verified: boolean; matchFound: boolean; observation: string } {
  const clean = htmlOrText.toLowerCase();
  const target = expectedSubstring.toLowerCase();
  const matchFound = clean.includes(target);

  return {
    verified: matchFound,
    matchFound,
    observation: matchFound
      ? `State verification passed: Found expected "${expectedSubstring}"`
      : `State verification failed: Expected "${expectedSubstring}" was not found in page output.`,
  };
}
