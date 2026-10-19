#!/usr/bin/env node
/**
 * @file puppeteerRunner.mjs
 * @description Production-grade Puppeteer headless browser automation runner for Aeio.
 * 
 * Capabilities:
 * - End-to-End Workflow Automation (multi-step sequential actions in a single browser session)
 * - Turnkey Search & Navigate Flow (e.g. DuckDuckGo search -> channel/site navigation -> screenshot)
 * - Automated Web Navigation & DOM Inspection
 * - Programmatic Search Flow (DuckDuckGo, YouTube, Google)
 * - Headless Page Scraping of dynamic JavaScript-heavy SPAs
 * - Full-page or Viewport Screenshots (e.g. mrbeast.png)
 * - PDF Document Generation
 * - Form Fill & Element Click Automation
 * 
 * Reliability & Safety:
 * - Headless mode enabled by default (runs silently in the background)
 * - Guaranteed cleanup in finally block (prevents orphaned Chromium processes)
 * - Process signal interception (SIGINT/SIGTERM) for clean shutdown
 * - Step-by-step trace reporting with microsecond timestamps
 * - Robust error handling with contextual diagnostic messages
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Parses command-line arguments into a structured options object.
 * Supports both JSON payload (--json '{"action":"..."}') and CLI flags.
 * 
 * @param {string[]} argv - Process argument array
 * @returns {Record<string, any>} Parsed options
 */
function parseArgs(argv) {
  const options = {
    action: 'navigate',
    url: '',
    headless: true, // Headless mode by default as requested
    outputPath: '',
    query: '',
    targetMatch: '',
    selector: '',
    text: '',
    timeout: 30000,
    fullPage: false,
    format: 'png',
    steps: [],
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json' && argv[i + 1]) {
      try {
        const parsed = JSON.parse(argv[++i]);
        Object.assign(options, parsed);
        if (parsed.output && !options.outputPath) options.outputPath = parsed.output;
        if (parsed.target && !options.targetMatch) options.targetMatch = parsed.target;
      } catch (err) {
        console.error(JSON.stringify({
          success: false,
          error: `Malformed JSON payload in --json: ${err.message}`,
        }));
        process.exit(1);
      }
    } else if (arg === '--action' && argv[i + 1]) {
      options.action = argv[++i];
    } else if (arg === '--url' && argv[i + 1]) {
      options.url = argv[++i];
    } else if (arg === '--query' && argv[i + 1]) {
      options.query = argv[++i];
    } else if (arg === '--target' && argv[i + 1]) {
      options.targetMatch = argv[++i];
    } else if (arg === '--selector' && argv[i + 1]) {
      options.selector = argv[++i];
    } else if (arg === '--text' && argv[i + 1]) {
      options.text = argv[++i];
    } else if (arg === '--output' && argv[i + 1]) {
      options.outputPath = argv[++i];
    } else if (arg === '--timeout' && argv[i + 1]) {
      options.timeout = parseInt(argv[++i], 10) || 30000;
    } else if (arg === '--steps' && argv[i + 1]) {
      try {
        options.steps = JSON.parse(argv[++i]);
      } catch {
        options.steps = [];
      }
    } else if (arg === '--headed') {
      options.headless = false;
    } else if (arg === '--headless') {
      options.headless = true;
    } else if (arg === '--full-page') {
      options.fullPage = true;
    }
  }

  // Normalize aliases
  if (options.target && !options.targetMatch) options.targetMatch = options.target;
  if (options.output && !options.outputPath) options.outputPath = options.output;

  return options;
}

/**
 * Validates and normalizes target web URLs.
 * 
 * @param {string} rawUrl - Input URL string
 * @returns {string} Normalized URL
 */
function normalizeTargetUrl(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('A target URL is required for this browser action.');
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * Ensures parent directory exists for file outputs.
 * 
 * @param {string} filePath - Target file path
 */
function ensureDirectory(filePath) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return resolved;
}

/**
 * Main Puppeteer execution routine.
 */
async function main() {
  const options = parseArgs(process.argv);
  const startTime = Date.now();
  let browser = null;

  // Signal interception to guarantee browser cleanup on process termination
  const cleanExit = async () => {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    process.exit(1);
  };
  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);

  try {
    // Step 1: Dynamic import of Puppeteer with clear error reporting if missing
    let puppeteer;
    try {
      const imported = await import('puppeteer');
      puppeteer = imported.default || imported;
    } catch (err) {
      console.log(JSON.stringify({
        success: false,
        error: `Puppeteer is not installed: ${err.message}. Run 'npm install puppeteer' to enable browser automation.`,
        code: 'PUPPETEER_NOT_FOUND',
      }));
      process.exit(1);
    }

    // Step 2: Launch browser in headless mode by default
    // Using standard modern Chromium flags for speed, stability and container compatibility
    browser = await puppeteer.launch({
      headless: options.headless !== false ? 'shell' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,800',
      ],
      defaultViewport: {
        width: 1280,
        height: 800,
      },
      timeout: options.timeout,
    });

    // Step 3: Create browser page and configure user agent and default timeouts
    const page = await browser.newPage();
    page.setDefaultTimeout(options.timeout);
    page.setDefaultNavigationTimeout(options.timeout);

    // Standard desktop User Agent prevents bot challenges on public sites
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Step 4: Route based on requested action
    switch (options.action) {
      // -----------------------------------------------------------------------
      // Action 1: End-to-End Search & Navigate Workflow (e.g. MrBeast -> YouTube -> mrbeast.png)
      // -----------------------------------------------------------------------
      case 'search_and_navigate': {
        const query = options.query || options.text || '';
        if (!query.trim()) {
          throw new Error("Search & navigate action requires a non-empty 'query' string.");
        }

        const engine = options.engine || 'duckduckgo';
        const targetMatch = (options.targetMatch || '').toLowerCase();
        const destinationFile = options.outputPath || 'mrbeast.png';
        const stepTrace = [];

        // 1.1: Build search query URL
        let searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
        if (engine === 'youtube') {
          searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        } else if (engine === 'google') {
          searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        }

        const step1Start = Date.now();
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: options.timeout });
        stepTrace.push({
          step: 1,
          name: 'open_search_engine',
          url: page.url(),
          engine,
          durationMs: Date.now() - step1Start,
        });

        // 1.2: Wait for search results hydration
        await new Promise((r) => setTimeout(r, 1500));

        // 1.3: Find target destination link from search results
        const step2Start = Date.now();
        const matchResult = await page.evaluate((targetSubstring) => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          const candidates = [];

          for (const a of links) {
            const href = a.href || '';
            const text = a.innerText ? a.innerText.trim() : '';

            // Filter out search engine self-links
            if (
              !href.startsWith('http') ||
              href === 'https://duckduckgo.com/' ||
              href === 'https://duckduckgo.com' ||
              href.startsWith('https://duckduckgo.com/?') ||
              href.includes('google.com/search') ||
              href.includes('google.com/url?')
            ) {
              continue;
            }

            let resolvedHref = href;
            if (href.includes('duckduckgo.com/l/?uddg=')) {
              try {
                resolvedHref = decodeURIComponent(href.split('uddg=')[1].split('&')[0]);
              } catch {}
            }

            candidates.push({ text, href: resolvedHref });
          }

          // If a specific target domain or keyword was specified, search for it first
          if (targetSubstring) {
            const found = candidates.find(
              (c) =>
                c.href.toLowerCase().includes(targetSubstring) ||
                c.text.toLowerCase().includes(targetSubstring)
            );
            if (found) return found;
          }

          // Fallback to the first non-search result
          return candidates.length > 0 ? candidates[0] : null;
        }, targetMatch);

        if (!matchResult || !matchResult.href) {
          throw new Error(
            `No matching result found on ${engine} for query "${query}"${
              targetMatch ? ` matching "${targetMatch}"` : ''
            }.`
          );
        }

        stepTrace.push({
          step: 2,
          name: 'resolve_target_result',
          matchedLink: matchResult.href,
          matchedText: matchResult.text,
          durationMs: Date.now() - step2Start,
        });

        // 1.4: Navigate to target destination
        const step3Start = Date.now();
        await page.goto(matchResult.href, { waitUntil: 'domcontentloaded', timeout: options.timeout });
        // Allow brief moment for target DOM to settle
        await new Promise((r) => setTimeout(r, 2000));

        stepTrace.push({
          step: 3,
          name: 'navigate_to_destination',
          destinationUrl: page.url(),
          destinationTitle: await page.title(),
          durationMs: Date.now() - step3Start,
        });

        // 1.5: Capture screenshot to destination file
        const step4Start = Date.now();
        const resolvedPath = ensureDirectory(destinationFile);
        await page.screenshot({ path: resolvedPath, fullPage: Boolean(options.fullPage) });
        const stats = fs.statSync(resolvedPath);

        stepTrace.push({
          step: 4,
          name: 'capture_screenshot',
          outputPath: resolvedPath,
          fileSizeBytes: stats.size,
          durationMs: Date.now() - step4Start,
        });

        // 1.6: Return end-to-end report
        console.log(JSON.stringify({
          success: true,
          action: 'search_and_navigate',
          query,
          engine,
          targetMatch: targetMatch || undefined,
          matchedLink: matchResult.href,
          matchedTitle: matchResult.text,
          destinationUrl: page.url(),
          destinationTitle: await page.title(),
          screenshotPath: resolvedPath,
          fileSizeBytes: stats.size,
          stepTrace,
          durationMs: Date.now() - startTime,
        }));
        break;
      }

      // -----------------------------------------------------------------------
      // Action 2: Multi-Step Sequential Workflow Execution
      // -----------------------------------------------------------------------
      case 'workflow': {
        const steps = Array.isArray(options.steps) ? options.steps : [];
        if (steps.length === 0) {
          throw new Error("Workflow action requires a non-empty array of 'steps'.");
        }

        const stepTrace = [];
        const outputs = {};

        for (let idx = 0; idx < steps.length; idx++) {
          const step = steps[idx];
          const stepNum = idx + 1;
          const stepStart = Date.now();

          try {
            switch (step.type) {
              case 'navigate':
              case 'goto': {
                const targetUrl = normalizeTargetUrl(step.url);
                await page.goto(targetUrl, {
                  waitUntil: step.waitUntil || 'domcontentloaded',
                  timeout: step.timeout || options.timeout,
                });
                stepTrace.push({
                  step: stepNum,
                  type: 'navigate',
                  url: page.url(),
                  title: await page.title(),
                  durationMs: Date.now() - stepStart,
                });
                break;
              }

              case 'fill':
              case 'type': {
                if (!step.selector) throw new Error(`Step ${stepNum} (fill) requires a 'selector'.`);
                const waitOpts = { timeout: step.timeout || 10000 };
                if (step.visible !== undefined) waitOpts.visible = Boolean(step.visible);
                await page.waitForSelector(step.selector, waitOpts);
                await page.click(step.selector);
                const textToType = step.text || step.value || '';
                await page.type(step.selector, textToType, { delay: step.delay || 20 });
                if (step.press) {
                  await page.keyboard.press(step.press);
                }
                stepTrace.push({
                  step: stepNum,
                  type: 'fill',
                  selector: step.selector,
                  typedLength: textToType.length,
                  pressedKey: step.press || null,
                  durationMs: Date.now() - stepStart,
                });
                break;
              }

              case 'press': {
                const key = step.key || 'Enter';
                await page.keyboard.press(key);
                stepTrace.push({
                  step: stepNum,
                  type: 'press',
                  key,
                  durationMs: Date.now() - stepStart,
                });
                break;
              }

              case 'click': {
                if (!step.selector) throw new Error(`Step ${stepNum} (click) requires a 'selector'.`);
                const waitOpts = { timeout: step.timeout || 10000 };
                if (step.visible !== undefined) waitOpts.visible = Boolean(step.visible);
                await page.waitForSelector(step.selector, waitOpts);
                await page.click(step.selector);
                stepTrace.push({
                  step: stepNum,
                  type: 'click',
                  selector: step.selector,
                  currentUrl: page.url(),
                  durationMs: Date.now() - stepStart,
                });
                break;
              }

              case 'click_link_text':
              case 'click_match': {
                const matchText = (step.matchText || step.match || '').toLowerCase();
                if (!matchText) throw new Error(`Step ${stepNum} (click_match) requires 'matchText'.`);
                const clicked = await page.evaluate((txt) => {
                  const links = Array.from(document.querySelectorAll('a[href]'));
                  const target = links.find(
                    (a) =>
                      a.innerText.toLowerCase().includes(txt) ||
                      a.href.toLowerCase().includes(txt)
                  );
                  if (target) {
                    target.click();
                    return { found: true, href: target.href, text: target.innerText.trim() };
                  }
                  return { found: false };
                }, matchText);

                if (!clicked.found) {
                  throw new Error(`Could not find link matching text "${matchText}".`);
                }
                stepTrace.push({
                  step: stepNum,
                  type: 'click_match',
                  matchText,
                  clickedHref: clicked.href,
                  durationMs: Date.now() - stepStart,
                });
                break;
              }

              case 'wait': {
                const waitMs = step.timeout || step.ms || 1000;
                await new Promise((r) => setTimeout(r, waitMs));
                stepTrace.push({
                  step: stepNum,
                  type: 'wait',
                  waitedMs: waitMs,
                  durationMs: Date.now() - stepStart,
                });
                break;
              }

              case 'wait_for_selector': {
                if (!step.selector) throw new Error(`Step ${stepNum} requires a 'selector'.`);
                await page.waitForSelector(step.selector, { timeout: step.timeout || 10000 });
                stepTrace.push({
                  step: stepNum,
                  type: 'wait_for_selector',
                  selector: step.selector,
                  durationMs: Date.now() - stepStart,
                });
                break;
              }

              case 'screenshot': {
                const out = ensureDirectory(step.outputPath || options.outputPath || 'screenshot.png');
                await page.screenshot({ path: out, fullPage: Boolean(step.fullPage) });
                const stats = fs.statSync(out);
                outputs.screenshotPath = out;
                outputs.fileSizeBytes = stats.size;
                stepTrace.push({
                  step: stepNum,
                  type: 'screenshot',
                  outputPath: out,
                  fileSizeBytes: stats.size,
                  durationMs: Date.now() - stepStart,
                });
                break;
              }

              case 'scrape': {
                const scraped = await page.evaluate((sel) => {
                  if (sel) {
                    const el = document.querySelector(sel);
                    return el ? el.innerText.trim() : '';
                  }
                  return document.body ? document.body.innerText.replace(/\s+/g, ' ').trim() : '';
                }, step.selector);
                outputs.scrapedText = scraped.slice(0, 5000);
                stepTrace.push({
                  step: stepNum,
                  type: 'scrape',
                  selector: step.selector || 'body',
                  length: scraped.length,
                  durationMs: Date.now() - stepStart,
                });
                break;
              }

              default:
                throw new Error(`Unsupported workflow step type: '${step.type}'.`);
            }
          } catch (stepErr) {
            throw new Error(`Step ${stepNum} (${step.type}) failed: ${stepErr.message}`);
          }
        }

        console.log(JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: steps.length,
          finalUrl: page.url(),
          finalTitle: await page.title(),
          stepTrace,
          outputs,
          durationMs: Date.now() - startTime,
        }));
        break;
      }

      // -----------------------------------------------------------------------
      // Action 3: Navigate & Inspect Web Page
      // -----------------------------------------------------------------------
      case 'navigate': {
        const targetUrl = normalizeTargetUrl(options.url);
        const response = await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: options.timeout,
        });

        const status = response ? response.status() : 200;
        const pageTitle = await page.title();

        const extracted = await page.evaluate(() => {
          const clone = document.body.cloneNode(true);
          const removals = clone.querySelectorAll('script, style, noscript, svg');
          removals.forEach((el) => el.remove());

          const text = clone.innerText ? clone.innerText.replace(/\s+/g, ' ').trim() : '';
          const links = Array.from(document.querySelectorAll('a[href]'))
            .map((a) => ({
              text: a.innerText.trim(),
              url: a.href,
            }))
            .filter((l) => l.text.length > 0 && l.url.startsWith('http'))
            .slice(0, 25);

          return { text, links };
        });

        console.log(JSON.stringify({
          success: true,
          action: 'navigate',
          url: page.url(),
          title: pageTitle,
          status,
          wordCount: extracted.text ? extracted.text.split(/\s+/).length : 0,
          preview: extracted.text ? extracted.text.slice(0, 500) : '',
          links: extracted.links,
          durationMs: Date.now() - startTime,
        }));
        break;
      }

      // -----------------------------------------------------------------------
      // Action 4: Automated Search Flow (DuckDuckGo, YouTube, Google)
      // -----------------------------------------------------------------------
      case 'search': {
        const query = options.query || options.text || '';
        if (!query.trim()) {
          throw new Error("Search action requires a non-empty 'query' string.");
        }

        const engine = options.engine || 'duckduckgo';
        let searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
        if (engine === 'youtube') {
          searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        } else if (engine === 'google') {
          searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        }

        await page.goto(searchUrl, {
          waitUntil: 'domcontentloaded',
          timeout: options.timeout,
        });

        await new Promise((r) => setTimeout(r, 1200));
        const pageTitle = await page.title();

        const results = await page.evaluate((searchEngine) => {
          const items = [];
          if (searchEngine === 'duckduckgo') {
            const elements = document.querySelectorAll('article, [data-testid="result"]');
            elements.forEach((el) => {
              const titleEl = el.querySelector('h2, [data-testid="result-title-a"]');
              const linkEl = el.querySelector('a[href]');
              const snippetEl = el.querySelector('[data-result="snippet"], p');
              if (titleEl && linkEl && linkEl.href) {
                items.push({
                  title: titleEl.innerText.trim(),
                  url: linkEl.href,
                  snippet: snippetEl ? snippetEl.innerText.trim() : '',
                });
              }
            });
          } else {
            const links = Array.from(document.querySelectorAll('a[href]'));
            for (const a of links) {
              const title = a.innerText.trim();
              if (title.length > 5 && a.href.startsWith('http') && !a.href.includes('google.com/search')) {
                items.push({ title, url: a.href, snippet: '' });
                if (items.length >= 8) break;
              }
            }
          }
          return items.slice(0, 8);
        }, engine);

        let screenshotPath = undefined;
        if (options.outputPath) {
          const resolvedPath = ensureDirectory(options.outputPath);
          await page.screenshot({ path: resolvedPath, fullPage: options.fullPage });
          screenshotPath = resolvedPath;
        }

        console.log(JSON.stringify({
          success: true,
          action: 'search',
          query,
          engine,
          url: page.url(),
          title: pageTitle,
          resultsCount: results.length,
          results,
          screenshotPath,
          durationMs: Date.now() - startTime,
        }));
        break;
      }

      // -----------------------------------------------------------------------
      // Action 5: High-Fidelity Web Page Screenshot
      // -----------------------------------------------------------------------
      case 'screenshot': {
        const targetUrl = normalizeTargetUrl(options.url);
        const destination = ensureDirectory(options.outputPath || 'screenshot.png');

        await page.goto(targetUrl, {
          waitUntil: 'networkidle2',
          timeout: options.timeout,
        });

        if (options.selector) {
          await page.waitForSelector(options.selector, { timeout: 8000 });
          const element = await page.$(options.selector);
          if (element) {
            await element.screenshot({ path: destination });
          } else {
            await page.screenshot({ path: destination, fullPage: options.fullPage });
          }
        } else {
          await page.screenshot({
            path: destination,
            fullPage: Boolean(options.fullPage),
          });
        }

        const pageTitle = await page.title();
        const stats = fs.statSync(destination);

        console.log(JSON.stringify({
          success: true,
          action: 'screenshot',
          url: page.url(),
          title: pageTitle,
          outputPath: destination,
          fileSizeBytes: stats.size,
          fullPage: Boolean(options.fullPage),
          durationMs: Date.now() - startTime,
        }));
        break;
      }

      // -----------------------------------------------------------------------
      // Action 6: Scrape Dynamic Single Page Application (SPA)
      // -----------------------------------------------------------------------
      case 'scrape': {
        const targetUrl = normalizeTargetUrl(options.url);
        await page.goto(targetUrl, {
          waitUntil: 'networkidle2',
          timeout: options.timeout,
        });

        if (options.selector) {
          await page.waitForSelector(options.selector, { timeout: 10000 });
        }

        const pageTitle = await page.title();
        const content = await page.content();
        const visibleText = await page.evaluate(() => {
          return document.body ? document.body.innerText.trim() : '';
        });

        console.log(JSON.stringify({
          success: true,
          action: 'scrape',
          url: page.url(),
          title: pageTitle,
          contentLength: content.length,
          textContent: visibleText.slice(0, 5000),
          durationMs: Date.now() - startTime,
        }));
        break;
      }

      // -----------------------------------------------------------------------
      // Action 7: Click Element on Page
      // -----------------------------------------------------------------------
      case 'click': {
        const targetUrl = normalizeTargetUrl(options.url);
        const selector = options.selector;
        if (!selector) {
          throw new Error("Click action requires an element 'selector' (e.g. '#submit-btn').");
        }

        await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: options.timeout,
        });

        await page.waitForSelector(selector, { visible: true, timeout: 10000 });
        await page.click(selector);
        await new Promise((r) => setTimeout(r, 1000));

        console.log(JSON.stringify({
          success: true,
          action: 'click',
          targetUrl,
          currentUrl: page.url(),
          selector,
          title: await page.title(),
          durationMs: Date.now() - startTime,
        }));
        break;
      }

      // -----------------------------------------------------------------------
      // Action 8: Fill Input Field on Page
      // -----------------------------------------------------------------------
      case 'fill': {
        const targetUrl = normalizeTargetUrl(options.url);
        const selector = options.selector;
        const textToFill = options.text || options.value || '';

        if (!selector) {
          throw new Error("Fill action requires an input 'selector'.");
        }

        await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: options.timeout,
        });

        await page.waitForSelector(selector, { visible: true, timeout: 10000 });
        await page.click(selector);
        await page.type(selector, textToFill, { delay: 25 });

        console.log(JSON.stringify({
          success: true,
          action: 'fill',
          targetUrl,
          selector,
          filledLength: textToFill.length,
          title: await page.title(),
          durationMs: Date.now() - startTime,
        }));
        break;
      }

      // -----------------------------------------------------------------------
      // Action 9: Generate PDF Document
      // -----------------------------------------------------------------------
      case 'pdf': {
        const targetUrl = normalizeTargetUrl(options.url);
        const destination = ensureDirectory(options.outputPath || 'document.pdf');

        await page.goto(targetUrl, {
          waitUntil: 'networkidle2',
          timeout: options.timeout,
        });

        await page.pdf({
          path: destination,
          format: 'A4',
          printBackground: true,
          margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
        });

        const stats = fs.statSync(destination);

        console.log(JSON.stringify({
          success: true,
          action: 'pdf',
          url: page.url(),
          title: await page.title(),
          outputPath: destination,
          fileSizeBytes: stats.size,
          durationMs: Date.now() - startTime,
        }));
        break;
      }

      default: {
        throw new Error(
          `Unsupported Puppeteer action: '${options.action}'. Supported actions: search_and_navigate, workflow, navigate, search, screenshot, scrape, click, fill, pdf.`
        );
      }
    }
  } catch (err) {
    // Global error handler capturing timeouts, bad URLs, and crash events
    console.log(JSON.stringify({
      success: false,
      action: options.action,
      url: options.url,
      error: err.message || String(err),
      durationMs: Date.now() - startTime,
    }));
    process.exitCode = 1;
  } finally {
    // Guaranteed browser closure to avoid orphaned processes & resource leaks
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

// Execute runner
main();
