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
  mediaControl,
  searchMemories,
  addMemory,
  lockScreen,
  simulateKeyPress,
  simulateScroll,
  openApp,
  getSystemStatus,
  sendSystemNotification,
  listRunningApps,
  focusApp,
  toggleDarkMode,
  captureScreen,
} from '../ipc';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { isDestructiveCommandClient } from './plan';
import { evaluateMath, solveEquation, solveSystem } from './tools/mathTool';
import { browsePage, extractPageLinks } from './tools/browserTool';
import {
  guiClick,
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
    description: 'Searches the web (Google, YouTube, GitHub, DuckDuckGo) for real-time information or URLs.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query string' },
        platform: { type: 'string', enum: ['google', 'youtube', 'github', 'duckduckgo'], description: 'Search platform' },
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
  const cleanName = toolName.toLowerCase().trim();

  switch (cleanName) {
    case 'search_web': {
      const query = args.query || args.search || '';
      const platform = args.platform || 'google';
      return await searchWebPlatform(query, platform);
    }

    case 'fetch_url': {
      const url = args.url || '';
      return await fetchUrl(url);
    }

    case 'read_file': {
      const path = args.path || args.filepath || '';
      return await readFile(path);
    }

    case 'write_file': {
      const path = args.path || args.filepath || '';
      const content = args.content ?? '';
      return await writeFile(path, content);
    }

    case 'search_files': {
      const dir = args.dir || args.directory || './';
      const query = args.query || '';
      return await searchFiles(dir, query);
    }

    case 'run_shell': {
      const command = args.command || '';
      if (isDestructiveCommandClient(command)) {
        throw new Error(`Refused: Destructive command detected ('${command}'). Requires explicit manual authorization.`);
      }
      return await runShellCommand(command, args.cwd);
    }

    case 'open_target': {
      const target = args.target || args.url || args.path || '';
      return await openTarget(target);
    }

    case 'play_spotify': {
      const query = args.query || args.song || '';
      return await playSpotify(query);
    }

    case 'set_system_volume': {
      const level = typeof args.level === 'number' ? args.level : 50;
      return await setSystemVolume(level);
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

