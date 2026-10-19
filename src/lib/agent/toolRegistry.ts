import {
  searchWebPlatform,
  fetchUrl,
  readFile,
  writeFile,
  searchFiles,
  runShellCommand,
  openTarget,
  playSpotify,
  setSystemVolume,
  getSystemVolume,
  setSystemMute,
  mediaControl,
  searchMemories,
  addMemory,
  lockScreen,
  simulateKeyPress,
  simulateScroll,
  openApp,
  injectTextToActiveApp,
  getSystemStatus,
  sendSystemNotification,
  listRunningApps,
  focusApp,
  toggleDarkMode,
  manageActiveWindow,
  searchLocalFiles,
  getPowerStatus,
  getActiveWindowContext,
  getHardwareTelemetry,
  getGlobalShortcuts,
  captureScreen,
  readClipboard,
  writeClipboard,
} from '../ipc';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { isDestructiveCommandClient, normalizeToolName } from './plan';
import { evaluateMath, solveEquation, solveSystem } from './tools/mathTool';
import { browsePage, extractPageLinks } from './tools/browserTool';
import {
  guiClick,
  guiMove,
  guiType,
  guiKeyCombo,
  guiScroll,
  guiDrag,
  guiInspectScreen,
} from './tools/guiVisionTool';
import {
  inspectInteractivePage,
  clickBrowserElement,
  fillBrowserField,
  verifyPageState,
} from './tools/visualBrowserTool';
import { globalMcpManager } from '../mcp/mcpClient';
import { searxngSearchService } from './tools/searxngSearch';
import { executePuppeteerAction } from './tools/puppeteerTool';

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export function getAvailableAgentTools(): AgentToolDefinition[] {
  const mcpTools: AgentToolDefinition[] = globalMcpManager.getAllTools().map((t) => ({
    name: `mcp__${t.serverId}__${t.name}`,
    description: `[MCP: ${t.serverName}] ${t.description || ''}`,
    parameters: t.inputSchema || { type: 'object' },
  }));
  return [...AVAILABLE_AGENT_TOOLS, ...mcpTools];
}

export const AVAILABLE_AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'search_web',
    description: 'Searches the web via SearXNG for real-time information or via desktop browser platforms (Google, YouTube, GitHub, DuckDuckGo). For factual/current questions, returns title, url, and concatenated content of top 1-3 results as context.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query string' },
        platform: { type: 'string', enum: ['searxng', 'google', 'youtube', 'github', 'duckduckgo'], description: 'Search platform (defaults to searxng for real-time fact retrieval)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'searxng_search',
    description: 'Queries SearXNG (GET {SEARXNG_URL}/search?q={query}&format=json&language=en) for real-time information, current events, or uncertain facts. Returns title, url, and concatenated content of 1-3 most relevant results as context. If no reliable information is found, returns an empty result message.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query for real-time information, current events, or uncertain facts' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Downloads a webpage or API and returns its text content for reading and research.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'HTTP or HTTPS URL to fetch' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browse_page',
    description: 'Fetches and parses a web page into clean, structured Markdown, extracting title, description, and key links.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'HTTP or HTTPS URL to browse' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_links',
    description: 'Extracts all navigation and resource hyperlinks from a web page for deep-dive research.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'HTTP or HTTPS URL to analyze' },
        sameDomainOnly: { type: 'boolean', description: 'Whether to restrict results to the same domain' },
      },
      required: ['url'],
    },
  },
  {
    name: 'read_file',
    description: 'Reads the text content of a local file on the computer.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Creates or updates a file (documents, code, reports, or .csv spreadsheets).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Destination file path' },
        content: { type: 'string', description: 'Text or tabular content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'search_files',
    description: 'Finds files in a directory matching a search pattern or name.',
    parameters: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Directory to search, defaults to ./' },
        query: { type: 'string', description: 'Search query or filename substring' },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_shell',
    description: 'Executes a safe terminal command on the computer and returns stdout/stderr.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command line string to run' },
        cwd: { type: 'string', description: 'Optional working directory' },
      },
      required: ['command'],
    },
  },
  {
    name: 'list_directory',
    description: 'Lists files and folders inside a local directory.',
    parameters: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Directory path, defaults to ./' },
      },
    },
  },
  {
    name: 'open_target',
    description: 'Opens an application, URL, or local file in the system default viewer.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Application name, URL, or file path to open' },
      },
      required: ['target'],
    },
  },
  {
    name: 'open_app',
    description: 'Launches or focuses desktop applications, websites, or web services (e.g. YouTube, Spotify, Chrome, Terminal).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Application name, website, or service name to launch' },
      },
      required: ['name'],
    },
  },
  {
    name: 'play_spotify',
    description: 'Searches and plays a song or artist on Spotify.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Song title or artist name' },
      },
      required: ['query'],
    },
  },
  {
    name: 'set_system_volume',
    description: 'Adjusts computer master volume from 0 to 100 percent.',
    parameters: {
      type: 'object',
      properties: {
        level: { type: 'number', description: 'Volume level between 0 and 100' },
      },
      required: ['level'],
    },
  },
  {
    name: 'get_system_volume',
    description: 'Gets current system volume level and mute status.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'set_system_mute',
    description: 'Mutes or unmutes the computer master volume.',
    parameters: {
      type: 'object',
      properties: {
        mute: { type: 'boolean', description: 'Whether system audio should be muted' },
      },
      required: ['mute'],
    },
  },
  {
    name: 'media_control',
    description: 'Controls media playback (play, pause, next, previous).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['play', 'pause', 'next', 'previous'], description: 'Playback action' },
      },
      required: ['action'],
    },
  },
  {
    name: 'search_memory',
    description: 'Queries long-term persistent SQLite memory store for previously saved facts and preferences.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Semantic or keyword search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_memory',
    description: 'Stores a new user preference or fact into permanent memory.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Information to remember' },
        category: { type: 'string', enum: ['fact', 'preference', 'project', 'person'] },
      },
      required: ['content'],
    },
  },
  {
    name: 'lock_screen',
    description: 'Locks the computer screen.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'math_evaluate',
    description: 'Evaluates arithmetic, trigonometric, or scientific math expressions exactly with zero LLM hallucination.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Math expression e.g. "sqrt(144) + 25 * 4", "sin(45) + cos(45)"' },
        angle: { type: 'string', enum: ['deg', 'rad'], description: 'Angle mode (deg or rad)' },
      },
      required: ['expression'],
    },
  },
  {
    name: 'math_solve',
    description: 'Solves algebraic equations (linear, quadratic) or systems of linear equations with full steps.',
    parameters: {
      type: 'object',
      properties: {
        equation: { type: 'string', description: 'Equation to solve, e.g. "3x + 9 = 24", "x^2 - 5x + 6 = 0"' },
        equations: { type: 'array', items: { type: 'string' }, description: 'Array of linear equations for systems' },
      },
    },
  },
  {
    name: 'ui_command',
    description: 'Executes fast-path on-screen desktop actions (simulate key press, scroll, launch application).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['key', 'scroll', 'open_app'], description: 'Action kind' },
        key: { type: 'string', description: 'Key name (enter, esc, tab, space, up, down, f5, alt+left)' },
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Scroll steps (3 to 12)' },
        app: { type: 'string', description: 'Desktop application name to launch' },
      },
      required: ['action'],
    },
  },
  {
    name: 'simulate_key_press',
    description: 'Simulates pressing a keyboard key (enter, escape, tab, space, up, down, left, right, f5, alt+left).',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name to press' },
      },
      required: ['key'],
    },
  },
  {
    name: 'simulate_scroll',
    description: 'Simulates scrolling the active desktop window up, down, left, or right.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Number of scroll steps (default 6)' },
      },
      required: ['direction'],
    },
  },
  {
    name: 'inject_text',
    description: 'Types or pastes a text string into the active focused desktop application.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text string to inject' },
      },
      required: ['text'],
    },
  },
  {
    name: 'read_clipboard',
    description: 'Reads current text content from the system clipboard.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'write_clipboard',
    description: 'Writes a text string to the system clipboard.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to copy to clipboard' },
      },
      required: ['text'],
    },
  },
  {
    name: 'get_system_status',
    description: 'Inspects real-time computer hardware status: battery percentage, charging state, active frontmost app, and dark mode.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'send_notification',
    description: 'Sends a native desktop notification banner with a title, message, and audio chime.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title' },
        message: { type: 'string', description: 'Notification body text' },
      },
      required: ['title', 'message'],
    },
  },
  {
    name: 'list_running_apps',
    description: 'Returns a list of all currently open and running desktop applications.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'focus_app',
    description: 'Brings an application to the frontmost focus on the screen.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Application name (e.g. "Slack", "Chrome", "Visual Studio Code")' },
      },
      required: ['name'],
    },
  },
  {
    name: 'toggle_dark_mode',
    description: 'Toggles system-wide dark mode / light mode appearance.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'take_screenshot',
    description: 'Captures a full desktop screenshot and saves it to a specified file path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Destination PNG file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'gui_click',
    description: 'Vision-driven computer control: clicks on a button, link, or coordinate on screen. Can ground elements by visual natural language description or direct (x, y) coordinates.',
    parameters: {
      type: 'object',
      properties: {
        element: { type: 'string', description: 'Visual element description e.g. "search bar", "Send button", "Close icon"' },
        x: { type: 'number', description: 'Explicit X pixel coordinate' },
        y: { type: 'number', description: 'Explicit Y pixel coordinate' },
        app: { type: 'string', description: 'Target application name e.g. "Slack", "Chrome", "Spotify"' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button' },
        double: { type: 'boolean', description: 'Double click' },
      },
    },
  },
  {
    name: 'gui_move',
    description: 'Moves the mouse cursor to explicit (x, y) screen coordinates without clicking.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Explicit X pixel coordinate' },
        y: { type: 'number', description: 'Explicit Y pixel coordinate' },
        app: { type: 'string', description: 'Optional target application to bring to focus first' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'gui_type',
    description: 'Types text into the active focused on-screen field, with optional Enter submission.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text string to type' },
        app: { type: 'string', description: 'Target application name to focus before typing' },
        pressEnter: { type: 'boolean', description: 'Whether to press Enter after typing' },
      },
      required: ['text'],
    },
  },
  {
    name: 'gui_key_combo',
    description: 'Presses a keyboard shortcut or key combination (e.g. ["cmd", "c"], ["ctrl", "v"], ["enter"], ["escape"]).',
    parameters: {
      type: 'object',
      properties: {
        keys: { type: 'array', items: { type: 'string' }, description: 'Keys in combo, e.g. ["cmd", "a"] or ["enter"]' },
        app: { type: 'string', description: 'Target application to focus' },
      },
      required: ['keys'],
    },
  },
  {
    name: 'gui_scroll',
    description: 'Scrolls the active window viewport in any direction.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Scroll steps (default: 5)' },
        dx: { type: 'number', description: 'Horizontal scroll delta' },
        dy: { type: 'number', description: 'Vertical scroll delta' },
      },
    },
  },
  {
    name: 'gui_drag',
    description: 'Performs an on-screen mouse drag from start coordinates to end coordinates.',
    parameters: {
      type: 'object',
      properties: {
        startX: { type: 'number', description: 'Start X coordinate' },
        startY: { type: 'number', description: 'Start Y coordinate' },
        endX: { type: 'number', description: 'End X coordinate' },
        endY: { type: 'number', description: 'End Y coordinate' },
        app: { type: 'string', description: 'Target application' },
      },
      required: ['startX', 'startY', 'endX', 'endY'],
    },
  },
  {
    name: 'gui_inspect_screen',
    description: 'Captures the current desktop screen frame and inspects window elements, resolution, and visual state.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Target application to bring to focus first' },
        instruction: { type: 'string', description: 'Specific visual detail or element to look for' },
      },
    },
  },
  {
    name: 'browser_inspect',
    description: 'Visually and structurally inspects an interactive web page (URL), discovering buttons, inputs, links, and capturing an optional screenshot.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Web page URL to inspect' },
        takeScreenshot: { type: 'boolean', description: 'Whether to capture desktop visual screenshot' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description: 'Simulates clicking an interactive DOM element on a webpage by selector or target index.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target webpage URL' },
        target: { description: 'Target element index number (e.g. 1) or CSS selector' },
      },
      required: ['url', 'target'],
    },
  },
  {
    name: 'browser_fill',
    description: 'Simulates filling a form input field on a webpage with a specified value by selector or element index.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target webpage URL' },
        target: { description: 'Target input field index number or CSS selector' },
        value: { type: 'string', description: 'Text value to fill into the input field' },
      },
      required: ['url', 'target', 'value'],
    },
  },
  {
    name: 'verify_page_state',
    description: 'Verifies whether a page response or output contains expected state markers or confirmation text.',
    parameters: {
      type: 'object',
      properties: {
        expected: { type: 'string', description: 'Expected text or confirmation phrase to verify' },
        content: { type: 'string', description: 'Page content or HTML text to check against' },
      },
      required: ['expected', 'content'],
    },
  },
  {
    name: 'puppeteer_action',
    description: 'Automates Chrome/Chromium via Puppeteer in headless mode. Supports navigating pages, searching and navigating channels/results (e.g. DuckDuckGo, YouTube, Google), capturing screenshots to file (e.g. mrbeast.png), scraping dynamic SPAs, clicking elements, filling forms, and generating PDFs.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search_and_navigate', 'workflow', 'navigate', 'search', 'screenshot', 'scrape', 'click', 'fill', 'pdf'],
          description: 'The automation action to perform',
        },
        url: { type: 'string', description: 'Web page URL to navigate, screenshot, scrape, or automate' },
        query: { type: 'string', description: 'Search query string for automated search flow' },
        engine: { type: 'string', enum: ['duckduckgo', 'youtube', 'google'], description: 'Search engine for search action (defaults to duckduckgo)' },
        targetMatch: { type: 'string', description: 'Domain or keyword filter for target destination (e.g. "youtube.com")' },
        outputPath: { type: 'string', description: 'Destination file path for screenshots or PDFs (e.g. "mrbeast.png" or "/tmp/page.pdf")' },
        selector: { type: 'string', description: 'Target CSS selector to wait for, click, fill, or screenshot' },
        text: { type: 'string', description: 'Text value to type into an input field or search query' },
        steps: {
          type: 'array',
          description: 'List of sequential steps when action is "workflow"',
          items: { type: 'object' },
        },
        headless: { type: 'boolean', description: 'Whether to run browser in headless mode (defaults to true)' },
        fullPage: { type: 'boolean', description: 'Whether to capture full-page screenshot (defaults to false)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'puppeteer_workflow',
    description: 'Executes a sequential multi-step browser automation workflow (navigate, fill, click, click_match, wait, screenshot, scrape) within a single headless Chrome session.',
    parameters: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          description: 'Ordered array of workflow steps to execute sequentially',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['navigate', 'fill', 'click', 'click_match', 'wait', 'wait_for_selector', 'screenshot', 'scrape'] },
              url: { type: 'string' },
              selector: { type: 'string' },
              text: { type: 'string' },
              press: { type: 'string' },
              matchText: { type: 'string' },
              timeout: { type: 'number' },
              outputPath: { type: 'string' },
              fullPage: { type: 'boolean' },
            },
            required: ['type'],
          },
        },
        headless: { type: 'boolean', description: 'Run headless (defaults to true)' },
        timeout: { type: 'number', description: 'Total workflow timeout in ms' },
      },
      required: ['steps'],
    },
  },
  {
    name: 'manage_window',
    description: 'Manipulates the active foreground application window (maximize, minimize, tile_left, tile_right, center, fullscreen).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['maximize', 'minimize', 'tile_left', 'tile_right', 'center', 'fullscreen'],
          description: 'Window layout action to execute',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'search_local_files',
    description: 'Searches local indexed files on the host machine using native OS search indexers (Spotlight mdfind on macOS, Windows Search on Windows). Returns matching file paths and names.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'File name, pattern, or search query to find' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_power_status',
    description: 'Queries real-time battery percentage, charging state (charging/discharging), power source (AC/Battery), and remaining battery runtime.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_active_window_context',
    description: 'Inspects the frontmost application process, window title, PID, and window bounds.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_hardware_telemetry',
    description: 'Queries comprehensive hardware performance metrics: CPU load percentage, RAM usage (used/total/percent), disk space, and top resource-consuming processes.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_global_shortcuts',
    description: 'Retrieves all registered system-wide global hotkeys and their desktop automation actions.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'finish',
    description: 'Call this tool when the overall goal has been completely achieved, providing a concise final summary.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Clear completion report of what was accomplished' },
      },
      required: ['summary'],
    },
  },
];

export async function executeAgentTool(toolName: string, args: Record<string, any>): Promise<any> {
  const cleanName = normalizeToolName(toolName);

  switch (cleanName) {
    case 'searxng_search': {
      const query = args.query || args.search || args.q || '';
      const searchVm = await searxngSearchService.search(query);
      return searchVm.toToolOutput();
    }

    case 'search_web': {
      const query = args.query || args.search || args.q || args.song || args.track || '';
      let platform = args.platform;
      if (!platform && (args.youtube || String(query).toLowerCase().includes('youtube'))) {
        platform = 'youtube';
      }
      if (platform === 'searxng') {
        const searchVm = await searxngSearchService.search(query);
        return searchVm.toToolOutput();
      }
      const targetApp = args.app || args.appName;
      return targetApp
        ? await searchWebPlatform(query, platform || 'google', targetApp)
        : await searchWebPlatform(query, platform || 'google');
    }

    case 'fetch_url': {
      const url = args.url || args.link || '';
      return await fetchUrl(url);
    }

    case 'read_file': {
      const path = args.path || args.filepath || args.file || args.filename || '';
      return await readFile(path);
    }

    case 'write_file': {
      const path = args.path || args.filepath || args.file || args.filename || '';
      const content = args.content ?? args.text ?? args.code ?? '';
      return await writeFile(path, content);
    }

    case 'search_files': {
      const dir = args.dir || args.directory || args.path || './';
      const query = args.query || args.pattern || '';
      return await searchFiles(dir, query);
    }

    case 'list_directory': {
      const dir = args.dir || args.directory || args.path || './';
      return await searchFiles(dir, '');
    }

    case 'run_shell': {
      const command = args.command || args.cmd || args.script || '';
      if (isDestructiveCommandClient(command)) {
        throw new Error(`Refused: Destructive command detected ('${command}'). Requires explicit manual authorization.`);
      }
      return await runShellCommand(command, args.cwd);
    }

    case 'open_target': {
      const target = args.target || args.url || args.path || args.name || args.app || '';
      return await openTarget(target);
    }

    case 'open_app': {
      const appName = args.name || args.app || args.appName || args.target || '';
      return await openApp(appName);
    }

    case 'simulate_key_press': {
      const key = args.key || args.keyName || 'enter';
      return await simulateKeyPress(key);
    }

    case 'simulate_scroll': {
      const direction = args.direction || 'down';
      const amount = typeof args.amount === 'number' ? args.amount : 6;
      return await simulateScroll(direction, amount);
    }

    case 'inject_text': {
      const text = args.text || args.content || '';
      return await injectTextToActiveApp(text);
    }

    case 'read_clipboard': {
      return await readClipboard();
    }

    case 'write_clipboard': {
      const text = args.text || args.content || '';
      await writeClipboard(text);
      return 'Content written to clipboard';
    }

    case 'play_spotify': {
      const query = args.query || args.song || '';
      return await playSpotify(query);
    }

    case 'set_system_volume': {
      const level = typeof args.level === 'number' ? args.level : (typeof args.volume === 'number' ? args.volume : 50);
      return await setSystemVolume(level);
    }

    case 'get_system_volume': {
      return await getSystemVolume();
    }

    case 'set_system_mute': {
      const mute = typeof args.mute === 'boolean' ? args.mute : true;
      return await setSystemMute(mute);
    }

    case 'media_control': {
      const action = args.action || 'playpause';
      return await mediaControl(action);
    }

    case 'search_memory': {
      const wsId = useWorkspaceStore.getState().activeWorkspace?.id;
      return await searchMemories(args.query || '', wsId, false, 5);
    }

    case 'add_memory': {
      const wsId = useWorkspaceStore.getState().activeWorkspace?.id;
      return await addMemory(args.content || '', args.category || 'preference', wsId);
    }

    case 'lock_screen': {
      return await lockScreen();
    }

    case 'manage_window': {
      const action = args.action || 'maximize';
      return await manageActiveWindow(action);
    }

    case 'search_local_files': {
      const query = args.query || args.filename || args.name || '';
      const limit = typeof args.limit === 'number' ? args.limit : undefined;
      return await searchLocalFiles(query, limit);
    }

    case 'get_power_status': {
      return await getPowerStatus();
    }

    case 'get_active_window_context': {
      return await getActiveWindowContext();
    }

    case 'get_hardware_telemetry': {
      return await getHardwareTelemetry();
    }

    case 'get_global_shortcuts': {
      return await getGlobalShortcuts();
    }

    case 'math_evaluate': {
      const expr = args.expression || args.expr || '';
      return evaluateMath(expr, { angle: args.angle });
    }

    case 'math_solve': {
      if (Array.isArray(args.equations) && args.equations.length > 0) {
        return solveSystem(args.equations);
      }
      const eq = args.equation || args.eq || '';
      return solveEquation(eq);
    }

    case 'ui_command': {
      const action = args.action || 'key';
      if (action === 'key') {
        return await simulateKeyPress(args.key || 'enter');
      }
      if (action === 'scroll') {
        return await simulateScroll(args.direction || 'down', args.amount || 6);
      }
      if (action === 'open_app') {
        return await openApp(args.app || args.appName || '');
      }
      throw new Error(`Unknown UI command action: ${action}`);
    }

    case 'browse_page': {
      const url = args.url || '';
      return await browsePage(url);
    }

    case 'extract_links': {
      const url = args.url || '';
      const sameDomainOnly = Boolean(args.sameDomainOnly ?? args.same_domain_only);
      return await extractPageLinks(url, sameDomainOnly);
    }

    case 'get_system_status': {
      return await getSystemStatus();
    }

    case 'send_notification': {
      const title = args.title || 'Aeio Notification';
      const msg = args.message || args.body || '';
      return await sendSystemNotification(title, msg);
    }

    case 'list_running_apps': {
      return await listRunningApps();
    }

    case 'focus_app': {
      const name = args.name || args.appName || args.app || '';
      return await focusApp(name);
    }

    case 'toggle_dark_mode': {
      return await toggleDarkMode();
    }

    case 'take_screenshot': {
      const p = args.path || args.outputPath || args.file || '/tmp/aeio_screenshot.png';
      return await captureScreen(p);
    }

    case 'gui_click': {
      return await guiClick({
        x: args.x !== undefined ? Number(args.x) : undefined,
        y: args.y !== undefined ? Number(args.y) : undefined,
        element: args.element || args.target,
        app: args.app || args.appName,
        button: args.button,
        double: Boolean(args.double),
      });
    }

    case 'gui_move':
    case 'mouse_move': {
      return await guiMove({
        x: Number(args.x ?? 0),
        y: Number(args.y ?? 0),
        app: args.app || args.appName,
      });
    }

    case 'execute_computer_action':
    case 'computer_action': {
      const action = args.action || args;
      const aType = action.actionType || action.type;
      if (aType === 'move') {
        return await guiMove({ x: Number(action.x ?? 0), y: Number(action.y ?? 0), app: args.app });
      }
      if (aType === 'click') {
        return await guiClick({
          x: action.x !== undefined ? Number(action.x) : undefined,
          y: action.y !== undefined ? Number(action.y) : undefined,
          element: action.element || action.target,
          button: action.button,
          double: Boolean(action.double),
          app: args.app,
        });
      }
      if (aType === 'drag') {
        return await guiDrag({
          startX: Number(action.startX ?? action.start_x ?? 0),
          startY: Number(action.startY ?? action.start_y ?? 0),
          endX: Number(action.endX ?? action.end_x ?? 0),
          endY: Number(action.endY ?? action.end_y ?? 0),
          app: args.app,
        });
      }
      if (aType === 'type') {
        return await guiType({ text: String(action.text ?? ''), app: args.app });
      }
      if (aType === 'keyCombo') {
        const keys = Array.isArray(action.keys) ? action.keys : [action.key || 'enter'];
        return await guiKeyCombo({ keys, app: args.app });
      }
      if (aType === 'scroll') {
        return await guiScroll({ dx: Number(action.dx ?? 0), dy: Number(action.dy ?? 0), direction: action.direction });
      }
      return { success: false, message: `Unknown computer action: ${JSON.stringify(action)}` };
    }

    case 'gui_type': {
      const text = args.text || args.content || '';
      return await guiType({
        text,
        app: args.app || args.appName,
        pressEnter: Boolean(args.pressEnter ?? args.press_enter),
      });
    }

    case 'gui_key_combo': {
      const keys = Array.isArray(args.keys) ? args.keys : [args.key || args.keys || 'enter'];
      return await guiKeyCombo({
        keys,
        app: args.app || args.appName,
      });
    }

    case 'gui_scroll': {
      return await guiScroll({
        dx: args.dx !== undefined ? Number(args.dx) : undefined,
        dy: args.dy !== undefined ? Number(args.dy) : undefined,
        direction: args.direction,
        amount: args.amount !== undefined ? Number(args.amount) : undefined,
      });
    }

    case 'gui_drag': {
      return await guiDrag({
        startX: Number(args.startX ?? args.start_x ?? 0),
        startY: Number(args.startY ?? args.start_y ?? 0),
        endX: Number(args.endX ?? args.end_x ?? 0),
        endY: Number(args.endY ?? args.end_y ?? 0),
        app: args.app || args.appName,
      });
    }

    case 'gui_inspect_screen': {
      return await guiInspectScreen({
        app: args.app || args.appName,
        instruction: args.instruction || args.query,
      });
    }

    case 'browser_inspect': {
      const url = args.url || '';
      const takeScreenshot = Boolean(args.takeScreenshot ?? args.screenshot);
      return await inspectInteractivePage(url, takeScreenshot);
    }

    case 'browser_click': {
      const url = args.url || '';
      const target = args.target ?? args.selector ?? args.index ?? '';
      return await clickBrowserElement(url, target);
    }

    case 'browser_fill': {
      const url = args.url || '';
      const target = args.target ?? args.selector ?? args.index ?? '';
      const value = args.value !== undefined ? String(args.value) : '';
      return await fillBrowserField(url, target, value);
    }

    case 'verify_page_state': {
      const expected = args.expected ?? args.expectedSubstring ?? '';
      const content = args.content ?? args.html ?? '';
      return verifyPageState(expected, content);
    }

    case 'puppeteer_action': {
      return await executePuppeteerAction({
        action: args.action || 'navigate',
        url: args.url || args.link || '',
        query: args.query || args.search || args.q,
        engine: args.engine,
        targetMatch: args.targetMatch || args.target,
        outputPath: args.outputPath || args.output || args.path || args.file,
        selector: args.selector || args.target,
        text: args.text || args.value,
        steps: args.steps,
        headless: args.headless !== false,
        fullPage: Boolean(args.fullPage || args.full_page),
        timeout: args.timeout,
      });
    }

    case 'puppeteer_workflow': {
      return await executePuppeteerAction({
        action: 'workflow',
        steps: args.steps || [],
        outputPath: args.outputPath || args.output || args.path || args.file,
        headless: args.headless !== false,
        timeout: args.timeout,
      });
    }

    case 'puppeteer_search_and_navigate': {
      return await executePuppeteerAction({
        action: 'search_and_navigate',
        query: args.query || args.search || args.q || '',
        engine: args.engine || 'duckduckgo',
        targetMatch: args.targetMatch || args.target,
        outputPath: args.outputPath || args.output || args.path || args.file || 'mrbeast.png',
        headless: args.headless !== false,
        fullPage: Boolean(args.fullPage || args.full_page),
        timeout: args.timeout,
      });
    }

    case 'puppeteer_screenshot': {
      return await executePuppeteerAction({
        action: 'screenshot',
        url: args.url || args.link || '',
        outputPath: args.outputPath || args.output || args.path || args.file || 'screenshot.png',
        selector: args.selector,
        headless: args.headless !== false,
        fullPage: Boolean(args.fullPage || args.full_page),
        timeout: args.timeout,
      });
    }

    case 'puppeteer_search': {
      return await executePuppeteerAction({
        action: 'search',
        query: args.query || args.search || args.q || '',
        engine: args.engine || 'duckduckgo',
        outputPath: args.outputPath || args.output || args.path || args.file,
        headless: args.headless !== false,
        timeout: args.timeout,
      });
    }

    case 'puppeteer_action': {
      return await executePuppeteerAction({
        action: args.action || 'screenshot',
        url: args.url || args.link,
        query: args.query || args.search,
        selector: args.selector,
        outputPath: args.outputPath || args.output || args.path || args.file,
        headless: args.headless !== false,
        timeout: args.timeout,
      });
    }

    case 'finish': {
      return { status: 'completed', summary: args.summary || 'Task completed successfully.' };
    }

    default: {
      if (toolName.startsWith('mcp__')) {
        const parts = toolName.split('__');
        const serverId = parts[1];
        const rawTool = parts.slice(2).join('__');
        return await globalMcpManager.callTool(serverId, rawTool, args);
      }

      const mcpTool = globalMcpManager.getAllTools().find((t) => t.name === toolName);
      if (mcpTool) {
        return await globalMcpManager.callTool(mcpTool.serverId, mcpTool.name, args);
      }

      throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}

