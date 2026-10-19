/**
 * @file puppeteerTool.ts
 * @description TypeScript Agent Tool interface for Puppeteer-based headless browser automation in Aeio.
 * 
 * Provides high-level browser control for:
 * - End-to-End Workflow Automation (multi-step sequential actions in a single browser session)
 * - Turnkey Search & Navigate Flow (e.g. DuckDuckGo search -> channel/site navigation -> screenshot)
 * - Automated Web Navigation & DOM Inspection
 * - Programmatic Search & Channel Navigation (DuckDuckGo, YouTube, Google)
 * - Headless Page Scraping for dynamic Single Page Applications (SPAs)
 * - Full-page or Viewport Screenshots (e.g. saving to mrbeast.png)
 * - PDF Generation
 * - Form Fill & Element Click Automation
 * 
 * Architecture:
 * - Defaults to headless execution for silent, background operation.
 * - Invokes the dedicated Node.js runner (scripts/puppeteerRunner.mjs) via guarded shell execution.
 * - Catches timeouts, navigation errors, and network issues gracefully with structured feedback.
 */

import { runShellCommand, ShellOutput } from '../../ipc';

export type PuppeteerActionType =
  | 'search_and_navigate'
  | 'workflow'
  | 'navigate'
  | 'search'
  | 'screenshot'
  | 'scrape'
  | 'click'
  | 'fill'
  | 'pdf';

export interface PuppeteerWorkflowStep {
  type:
    | 'navigate'
    | 'goto'
    | 'fill'
    | 'type'
    | 'press'
    | 'click'
    | 'click_link_text'
    | 'click_match'
    | 'wait'
    | 'wait_for_selector'
    | 'screenshot'
    | 'scrape';
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  press?: string;
  key?: string;
  matchText?: string;
  match?: string;
  timeout?: number;
  ms?: number;
  outputPath?: string;
  fullPage?: boolean;
  delay?: number;
  visible?: boolean;
  waitUntil?: 'domcontentloaded' | 'networkidle0' | 'networkidle2' | 'load';
}

export interface PuppeteerActionOptions {
  action: PuppeteerActionType;
  url?: string;
  query?: string;
  engine?: 'duckduckgo' | 'google' | 'youtube';
  targetMatch?: string;
  target?: string;
  outputPath?: string;
  output?: string;
  selector?: string;
  text?: string;
  value?: string;
  headless?: boolean; // Defaults to true
  fullPage?: boolean;
  timeout?: number;
  steps?: PuppeteerWorkflowStep[];
}

export interface PuppeteerSearchResultItem {
  title: string;
  url: string;
  snippet?: string;
}

export interface PuppeteerActionResult {
  success: boolean;
  action: string;
  url?: string;
  title?: string;
  status?: number;
  wordCount?: number;
  preview?: string;
  links?: Array<{ text: string; url: string }>;
  results?: PuppeteerSearchResultItem[];
  resultsCount?: number;
  outputPath?: string;
  screenshotPath?: string;
  fileSizeBytes?: number;
  textContent?: string;
  contentLength?: number;
  targetMatch?: string;
  matchedLink?: string;
  matchedTitle?: string;
  destinationUrl?: string;
  destinationTitle?: string;
  finalUrl?: string;
  finalTitle?: string;
  totalSteps?: number;
  stepTrace?: Array<Record<string, any>>;
  outputs?: Record<string, any>;
  error?: string;
  durationMs?: number;
  rawStdout?: string;
}

/**
 * Essential data contract for user-facing browser automation artifacts.
 * Information Hiding: Exposes only essential user fields (file paths, status, summary, preview),
 * while strictly hiding raw process output, child process execution logs, CDP packets, and temporary directories.
 */
export interface IEssentialArtifactPresentation {
  readonly action: string;
  readonly success: boolean;
  readonly displayTitle: string;
  readonly summary: string;
  readonly screenshotPath?: string;
  readonly pdfPath?: string;
  readonly destinationUrl?: string;
  readonly resultsCount: number;
  readonly hasArtifact: boolean;
  readonly isHeadless: boolean;
}

/**
 * OOP Encapsulation Model for Puppeteer Automation Results.
 * Encapsulates the raw result object with private fields and exposes only essential getters.
 */
export class PuppeteerArtifactViewModel implements IEssentialArtifactPresentation {
  readonly #action: string;
  readonly #success: boolean;
  readonly #displayTitle: string;
  readonly #summary: string;
  readonly #screenshotPath?: string;
  readonly #pdfPath?: string;
  readonly #destinationUrl?: string;
  readonly #resultsCount: number;
  readonly #isHeadless: boolean;
  readonly #durationMs?: number;

  constructor(result: PuppeteerActionResult, isHeadless = true) {
    this.#action = result.action || 'browser_automation';
    this.#success = Boolean(result.success);
    this.#destinationUrl = result.destinationUrl || result.finalUrl || result.url;
    this.#resultsCount = result.resultsCount || (result.results ? result.results.length : 0);
    this.#isHeadless = isHeadless;
    this.#durationMs = result.durationMs;

    // Detect screenshot path
    if (result.outputPath && (result.outputPath.endsWith('.png') || result.outputPath.endsWith('.jpg') || result.outputPath.endsWith('.webp'))) {
      this.#screenshotPath = result.outputPath;
    } else if (result.screenshotPath) {
      this.#screenshotPath = result.screenshotPath;
    }

    // Detect PDF path
    if (result.outputPath && result.outputPath.endsWith('.pdf')) {
      this.#pdfPath = result.outputPath;
    }

    // Compute display title and clean human summary
    if (!this.#success) {
      this.#displayTitle = `Automation Failed (${this.#action})`;
      this.#summary = result.error || 'The browser task could not complete.';
    } else if (this.#action === 'search_and_navigate') {
      const match = result.destinationTitle || result.matchedTitle || result.destinationUrl || 'destination';
      this.#displayTitle = `Search & Navigation: ${match}`;
      this.#summary = `Navigated to ${match} and saved screenshot to ${this.#screenshotPath || 'file'}.`;
    } else if (this.#action === 'screenshot') {
      this.#displayTitle = `Screenshot Captured: ${result.title || result.url || 'Page'}`;
      this.#summary = `Captured full page screenshot to ${this.#screenshotPath || 'screenshot.png'}.`;
    } else if (this.#action === 'scrape') {
      this.#displayTitle = `Scraped: ${result.title || result.url || 'Webpage'}`;
      this.#summary = `Extracted ${result.wordCount || result.contentLength || 0} words of content from ${result.url}.`;
    } else if (this.#action === 'pdf') {
      this.#displayTitle = `PDF Generated: ${result.title || result.url || 'Document'}`;
      this.#summary = `Saved printable PDF document to ${this.#pdfPath || 'document.pdf'}.`;
    } else {
      this.#displayTitle = `Browser Workflow Completed: ${result.title || this.#action}`;
      this.#summary = result.totalSteps ? `Executed ${result.totalSteps} steps successfully.` : 'Action completed.';
    }
  }

  get action(): string {
    return this.#action;
  }

  get success(): boolean {
    return this.#success;
  }

  get displayTitle(): string {
    return this.#displayTitle;
  }

  get summary(): string {
    return this.#summary;
  }

  get screenshotPath(): string | undefined {
    return this.#screenshotPath;
  }

  get pdfPath(): string | undefined {
    return this.#pdfPath;
  }

  get destinationUrl(): string | undefined {
    return this.#destinationUrl;
  }

  get resultsCount(): number {
    return this.#resultsCount;
  }

  get hasArtifact(): boolean {
    return Boolean(this.#screenshotPath || this.#pdfPath);
  }

  get isHeadless(): boolean {
    return this.#isHeadless;
  }

  get durationMs(): number | undefined {
    return this.#durationMs;
  }

  /**
   * Safe parser to construct a ViewModel from any input payload.
   */
  static fromAny(data: any): PuppeteerArtifactViewModel | null {
    if (!data) return null;
    if (data instanceof PuppeteerArtifactViewModel) return data;
    if (typeof data === 'object' && ('action' in data || 'screenshotPath' in data || 'outputPath' in data)) {
      return new PuppeteerArtifactViewModel(data);
    }
    return null;
  }
}

/**
 * Executes a programmatic browser automation action using Puppeteer.
 * 
 * @param options - Configuration options for the browser action
 * @returns Structured result object with page data or error details
 */
export async function executePuppeteerAction(
  options: PuppeteerActionOptions
): Promise<PuppeteerActionResult> {
  // Step 1: Enforce headless mode by default as requested
  const sanitizedOptions: PuppeteerActionOptions = {
    ...options,
    headless: options.headless !== false, // Defaults to true unless explicitly set to false
    timeout: options.timeout || 30000,
  };

  // Step 2: Validate essential parameters before spawning browser
  if (sanitizedOptions.action === 'workflow') {
    if (!Array.isArray(sanitizedOptions.steps) || sanitizedOptions.steps.length === 0) {
      return {
        success: false,
        action: 'workflow',
        error: "Puppeteer 'workflow' action requires a non-empty array of 'steps'.",
      };
    }
  } else if (
    sanitizedOptions.action === 'search_and_navigate' ||
    sanitizedOptions.action === 'search'
  ) {
    if (!sanitizedOptions.query || sanitizedOptions.query.trim().length === 0) {
      return {
        success: false,
        action: sanitizedOptions.action,
        error: `Puppeteer '${sanitizedOptions.action}' action requires a non-empty 'query' string.`,
      };
    }
  } else if (
    !sanitizedOptions.url ||
    sanitizedOptions.url.trim().length === 0
  ) {
    return {
      success: false,
      action: sanitizedOptions.action,
      error: `Puppeteer action '${sanitizedOptions.action}' requires a valid target 'url'.`,
    };
  }

  // Step 3: Serialize payload and construct Node runner command
  // Escapes payload safely for cross-platform shell invocation
  const payloadJson = JSON.stringify(sanitizedOptions);
  const escapedJson = payloadJson.replace(/'/g, "'\\''");
  const command = `node scripts/puppeteerRunner.mjs --json '${escapedJson}'`;

  try {
    // Step 4: Execute via shell runner with current working directory
    const output: ShellOutput = await runShellCommand(command);

    // Step 5: Check for immediate shell execution errors or empty output
    if (!output.stdout || output.stdout.trim().length === 0) {
      if (output.stderr) {
        return {
          success: false,
          action: sanitizedOptions.action,
          error: `Puppeteer execution failed: ${output.stderr.trim()}`,
        };
      }
      return {
        success: false,
        action: sanitizedOptions.action,
        error: 'Puppeteer runner completed with empty output.',
      };
    }

    // Step 6: Parse structured JSON emitted by the runner script
    try {
      const parsed = JSON.parse(output.stdout.trim()) as PuppeteerActionResult;
      return {
        ...parsed,
        rawStdout: output.stdout,
      };
    } catch (parseErr: any) {
      // In case of unexpected stdout noise, attempt to isolate the last JSON line
      const lines = output.stdout.trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const candidate = JSON.parse(lines[i].trim());
          if (candidate && typeof candidate === 'object' && 'success' in candidate) {
            return {
              ...(candidate as PuppeteerActionResult),
              rawStdout: output.stdout,
            };
          }
        } catch {
          // Continue scanning backwards
        }
      }

      return {
        success: false,
        action: sanitizedOptions.action,
        error: `Could not parse Puppeteer JSON response: ${parseErr.message}. Output was: ${output.stdout.slice(0, 300)}`,
        rawStdout: output.stdout,
      };
    }
  } catch (err: any) {
    // Step 7: Handle any lower-level IPC or system execution failure
    return {
      success: false,
      action: sanitizedOptions.action,
      error: `Failed to execute Puppeteer runner: ${err.message || String(err)}`,
    };
  }
}

/**
 * Convenience helper to execute a sequential multi-step browser automation workflow.
 * 
 * @param steps - Sequence of workflow steps
 * @param options - Optional override options (e.g. headless, timeout)
 */
export async function executePuppeteerWorkflow(
  steps: PuppeteerWorkflowStep[],
  options?: Partial<PuppeteerActionOptions>
): Promise<PuppeteerActionResult> {
  return executePuppeteerAction({
    action: 'workflow',
    steps,
    ...options,
  });
}

/**
 * Convenience helper to execute an end-to-end Search & Navigate flow
 * (e.g. Search for "MrBeast", click target result/channel, and capture screenshot).
 * 
 * @param query - The search query string
 * @param targetMatch - Optional domain or keyword filter for the destination result (e.g. 'youtube.com')
 * @param outputPath - Destination screenshot path (defaults to 'mrbeast.png')
 * @param options - Additional options (e.g. engine, timeout)
 */
export async function executeSearchAndNavigateWorkflow(
  query: string,
  targetMatch?: string,
  outputPath?: string,
  options?: Partial<PuppeteerActionOptions>
): Promise<PuppeteerActionResult> {
  return executePuppeteerAction({
    action: 'search_and_navigate',
    query,
    targetMatch,
    outputPath: outputPath || 'mrbeast.png',
    ...options,
  });
}
