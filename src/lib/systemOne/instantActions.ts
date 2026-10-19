/**
 * System One Instant Action Dispatcher
 * 
 * Provides sub-millisecond, zero-shot pattern matching for high-frequency
 * desktop actions (app launching, volume/media control, web/YouTube searches,
 * screen lock, and math evaluation).
 * 
 * Bypasses network round-trips and LLM token generation delays to execute
 * direct user actions in a fraction of a second (< 30ms).
 */

export interface InstantActionMatch {
  toolName: string;
  args: Record<string, any>;
  statusText: string;
  completedMessage: string;
  isDestructive: boolean;
  riskTier: 'low' | 'medium' | 'critical';
}

/**
 * Matches user input against known zero-latency instant action patterns.
 * Returns null if the request requires multi-step planning or general LLM reasoning.
 */
export function matchInstantAction(prompt: string): InstantActionMatch | null {
  const trimmed = prompt.trim();
  if (!trimmed) return null;

  // Guard against conversational/multi-step prefixes
  if (
    /^(?:can you|could you|please explain|how do i|why|write|create|code|refactor|analyze)\b/i.test(trimmed) ||
    trimmed.includes(' and then ') ||
    trimmed.includes(' afterwards ') ||
    trimmed.includes(' before you ')
  ) {
    return null;
  }

  // Strip trailing punctuation (?, !, .) for conversational/voice queries
  const target = trimmed.replace(/[?.!]+$/, '').trim();
  if (!target) return null;

  // 1. Open / Launch desktop applications
  const openAppMatch = target.match(/^(?:open|launch|start)\s+(?:the\s+)?([a-zA-Z0-9\s._-]+?)(?:\s+app|\s+application)?$/i);
  if (openAppMatch && openAppMatch[1]) {
    const rawTarget = openAppMatch[1].trim();
    // Exclude generic queries or file targets
    if (
      !/^(?:file|folder|directory|url|link|page|window|tab|terminal command|browser to)\b/i.test(rawTarget) &&
      rawTarget.length >= 2 &&
      rawTarget.length <= 40
    ) {
      return {
        toolName: 'open_app',
        args: { name: rawTarget },
        statusText: `Opening ${rawTarget}...`,
        completedMessage: `Opened ${rawTarget}.`,
        isDestructive: false,
        riskTier: 'low',
      };
    }
  }

  // 2. Set system volume
  const volNumberMatch = target.match(/^(?:set\s+)?(?:system\s+)?volume\s+(?:to\s+)?(\d{1,3})%?$/i);
  if (volNumberMatch && volNumberMatch[1]) {
    const level = Math.min(100, Math.max(0, parseInt(volNumberMatch[1], 10)));
    return {
      toolName: 'set_system_volume',
      args: { level },
      statusText: `Setting system volume to ${level}%...`,
      completedMessage: `System volume set to ${level}%.`,
      isDestructive: false,
      riskTier: 'low',
      };
  }

  // Volume relative adjustment
  if (/^(?:volume\s+up|increase\s+volume|turn\s+up\s+volume)$/i.test(target)) {
    return {
      toolName: 'set_system_volume',
      args: { level: 75 },
      statusText: 'Increasing system volume...',
      completedMessage: 'System volume increased.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:volume\s+down|decrease\s+volume|lower\s+volume|turn\s+down\s+volume)$/i.test(target)) {
    return {
      toolName: 'set_system_volume',
      args: { level: 30 },
      statusText: 'Decreasing system volume...',
      completedMessage: 'System volume decreased.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 3. Mute / Unmute
  if (/^(?:mute|mute\s+volume|silence)$/i.test(target)) {
    return {
      toolName: 'set_system_mute',
      args: { mute: true },
      statusText: 'Muting system volume...',
      completedMessage: 'System volume muted.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:unmute|unmute\s+volume)$/i.test(target)) {
    return {
      toolName: 'set_system_mute',
      args: { mute: false },
      statusText: 'Unmuting system volume...',
      completedMessage: 'System volume unmuted.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 4. Media playback controls
  if (/^(?:play|resume|play\s+music|resume\s+music)$/i.test(target)) {
    return {
      toolName: 'media_control',
      args: { action: 'play' },
      statusText: 'Resuming media playback...',
      completedMessage: 'Media playback resumed.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:pause|stop\s+music|pause\s+music)$/i.test(target)) {
    return {
      toolName: 'media_control',
      args: { action: 'pause' },
      statusText: 'Pausing media playback...',
      completedMessage: 'Media playback paused.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:next\s+track|next\s+song|skip\s+song|skip\s+track)$/i.test(target)) {
    return {
      toolName: 'media_control',
      args: { action: 'next' },
      statusText: 'Skipping to next track...',
      completedMessage: 'Skipped to next track.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:previous\s+track|previous\s+song|prev\s+track)$/i.test(target)) {
    return {
      toolName: 'media_control',
      args: { action: 'previous' },
      statusText: 'Returning to previous track...',
      completedMessage: 'Returned to previous track.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 5. Compound browser & platform playback (e.g. "open youtube in jiosphere and play paradise interval BGM")
  const compoundBrowserMatch = target.match(
    /^(?:open|launch)\s+(youtube|spotify|netflix|github|google|chatgpt|twitter|x|reddit)\s+(?:in\s+([a-zA-Z0-9\s._-]+?)\s+)?and\s+(?:play|search(?:\s+for)?)\s+(.+)$/i
  );
  if (compoundBrowserMatch) {
    const platform = compoundBrowserMatch[1].toLowerCase();
    const app = compoundBrowserMatch[2]?.trim();
    const query = compoundBrowserMatch[3].trim();
    if (query) {
      const appMsg = app ? ` in ${app}` : '';
      return {
        toolName: platform === 'spotify' && !app ? 'play_spotify' : 'search_web',
        args: { query, platform, ...(app ? { app } : {}) },
        statusText: `Searching and playing "${query}" on ${compoundBrowserMatch[1]}${appMsg}...`,
        completedMessage: `Playing "${query}" on ${compoundBrowserMatch[1]}${appMsg}.`,
        isDestructive: false,
        riskTier: 'low',
      };
    }
  }

  // Play <song> on <platform> in <browser/app> (e.g. "play paradise interval BGM on youtube in jiosphere")
  const playInAppMatch = target.match(
    /^(?:play|search(?:\s+for)?)\s+(.+?)\s+(?:on|in)\s+(youtube|spotify)\s+in\s+([a-zA-Z0-9\s._-]+?)$/i
  );
  if (playInAppMatch) {
    const query = playInAppMatch[1].trim();
    const platform = playInAppMatch[2].toLowerCase();
    const app = playInAppMatch[3].trim();
    if (query && app) {
      return {
        toolName: 'search_web',
        args: { query, platform, app },
        statusText: `Playing "${query}" on ${playInAppMatch[2]} in ${app}...`,
        completedMessage: `Playing "${query}" on ${playInAppMatch[2]} in ${app}.`,
        isDestructive: false,
        riskTier: 'low',
      };
    }
  }

  // Open <platform/url> in <app> (e.g. "open youtube in jiosphere", "open https://news.ycombinator.com in chrome")
  const openInAppMatch = target.match(
    /^(?:open|launch)\s+(youtube|spotify|netflix|github|google|chatgpt|twitter|x|reddit|https?:\/\/[^\s]+)\s+in\s+([a-zA-Z0-9\s._-]+?)$/i
  );
  if (openInAppMatch) {
    const matchedTarget = openInAppMatch[1].trim();
    const app = openInAppMatch[2].trim();
    const lower = matchedTarget.toLowerCase();
    const isUrl = lower.startsWith('http://') || lower.startsWith('https://');

    return {
      toolName: 'search_web',
      args: { query: isUrl ? matchedTarget : '', platform: isUrl ? 'url' : lower, app },
      statusText: `Opening ${matchedTarget} in ${app}...`,
      completedMessage: `Opened ${matchedTarget} in ${app}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 6. YouTube playback and search
  const ytPlayMatch = target.match(/^(?:play\s+)?(.+?)\s+(?:on\s+youtube|in\s+youtube)$/i);
  if (ytPlayMatch && ytPlayMatch[1]) {
    const query = ytPlayMatch[1].trim();
    if (query) {
      return {
        toolName: 'search_web',
        args: { query, platform: 'youtube' },
        statusText: `Searching and playing "${query}" on YouTube...`,
        completedMessage: `Playing "${query}" on YouTube.`,
        isDestructive: false,
        riskTier: 'low',
      };
    }
  }

  const ytSearchMatch = target.match(/^(?:search\s+youtube\s+for|youtube)\s+(.+)$/i);
  if (ytSearchMatch && ytSearchMatch[1]) {
    const query = ytSearchMatch[1].trim();
    if (query) {
      return {
        toolName: 'search_web',
        args: { query, platform: 'youtube' },
        statusText: `Searching YouTube for "${query}"...`,
        completedMessage: `YouTube search results for "${query}".`,
        isDestructive: false,
        riskTier: 'low',
      };
    }
  }

  // 6. Spotify playback
  const spotifyMatch = target.match(/^(?:play\s+)?(.+?)\s+(?:on\s+spotify|in\s+spotify)$/i);
  if (spotifyMatch && spotifyMatch[1]) {
    const query = spotifyMatch[1].trim();
    if (query) {
      return {
        toolName: 'play_spotify',
        args: { query },
        statusText: `Playing "${query}" on Spotify...`,
        completedMessage: `Playing "${query}" on Spotify.`,
        isDestructive: false,
        riskTier: 'low',
      };
    }
  }

  // 7. General Web / Google search
  const webSearchMatch = target.match(/^(?:search\s+(?:the\s+)?web\s+for|search\s+google\s+for|google)\s+(.+)$/i);
  if (webSearchMatch && webSearchMatch[1]) {
    const query = webSearchMatch[1].trim();
    if (query) {
      return {
        toolName: 'search_web',
        args: { query, platform: 'google' },
        statusText: `Searching Google for "${query}"...`,
        completedMessage: `Google search launched for "${query}".`,
        isDestructive: false,
        riskTier: 'low',
      };
    }
  }

  // 8. Lock screen
  if (/^(?:lock\s+screen|lock\s+mac|lock\s+computer|lock\s+desktop)$/i.test(target)) {
    return {
      toolName: 'lock_screen',
      args: {},
      statusText: 'Locking screen...',
      completedMessage: 'Screen locked.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 9. Fast Math Evaluation
  const mathCalcMatch = target.match(/^(?:calculate|compute|evaluate|what\s+is)\s+([0-9+\-*/^().\s]{3,})$/i);
  if (mathCalcMatch && mathCalcMatch[1]) {
    const expr = mathCalcMatch[1].trim();
    if (/^[0-9+\-*/^().\s]+$/.test(expr)) {
      return {
        toolName: 'math_evaluate',
        args: { expression: expr },
        statusText: `Evaluating ${expr}...`,
        completedMessage: `Evaluated ${expr}.`,
        isDestructive: false,
        riskTier: 'low',
      };
    }
  }

  // Pure mathematical expression like "45 * 12" or "250 / 5"
  if (/^\s*\d+(?:\.\d+)?\s*[+\-*/^]\s*\d+(?:\.\d+)?(?:\s*[+\-*/^]\s*\d+(?:\.\d+)?)*\s*$/.test(target)) {
    return {
      toolName: 'math_evaluate',
      args: { expression: target },
      statusText: `Evaluating ${target}...`,
      completedMessage: `Evaluated ${target}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 10. Direct URL or File Path Opening (open_target)
  const urlMatch = target.match(/^(?:open|navigate\s+to|go\s+to)\s+(https?:\/\/[^\s]+)$/i);
  if (urlMatch && urlMatch[1]) {
    const url = urlMatch[1].trim();
    return {
      toolName: 'open_target',
      args: { target: url },
      statusText: `Opening ${url}...`,
      completedMessage: `Opened ${url}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  const filePathMatch = target.match(/^(?:open\s+(?:file|folder|directory)\s+|open\s+)([\/~][^\s]+)$/i);
  if (filePathMatch && filePathMatch[1]) {
    const targetPath = filePathMatch[1].trim();
    return {
      toolName: 'open_target',
      args: { target: targetPath },
      statusText: `Opening ${targetPath}...`,
      completedMessage: `Opened ${targetPath}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 11. Clipboard reading
  if (/^(?:read\s+clipboard|get\s+clipboard|check\s+clipboard|show\s+clipboard|view\s+clipboard|what(?:'s|\s+is)\s+on\s+my\s+clipboard)$/i.test(target)) {
    return {
      toolName: 'read_clipboard',
      args: {},
      statusText: 'Reading system clipboard...',
      completedMessage: 'Clipboard content retrieved.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 12. Volume status query
  if (/^(?:get\s+volume|check\s+volume|current\s+volume|what(?:'s|\s+is)\s+the\s+volume)$/i.test(target)) {
    return {
      toolName: 'get_system_volume',
      args: {},
      statusText: 'Checking system volume...',
      completedMessage: 'System volume checked.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 13. Keyboard key press simulation
  const keyPressMatch = target.match(/^(?:press|hit)\s+(enter|return|space|spacebar|esc|escape|tab)$/i);
  if (keyPressMatch && keyPressMatch[1]) {
    let key = keyPressMatch[1].toLowerCase();
    if (key === 'return') key = 'enter';
    if (key === 'spacebar') key = 'space';
    if (key === 'esc') key = 'escape';
    return {
      toolName: 'simulate_key_press',
      args: { key },
      statusText: `Pressing ${key} key...`,
      completedMessage: `Pressed ${key} key.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 14. Scrolling simulation
  const scrollMatch = target.match(/^(?:scroll\s+(down|up|left|right)|scroll\s+page\s+(down|up))$/i);
  if (scrollMatch) {
    const direction = (scrollMatch[1] || scrollMatch[2]).toLowerCase() as 'down' | 'up' | 'left' | 'right';
    return {
      toolName: 'simulate_scroll',
      args: { direction, amount: 6 },
      statusText: `Scrolling ${direction}...`,
      completedMessage: `Scrolled ${direction}.`,
      isDestructive: false,
      riskTier: 'low',
      };
  }

  // 15. Cursor & Mouse Controls
  // Mouse cursor movement: "move mouse to 500 300", "move cursor 500, 300"
  const mouseMoveMatch = target.match(/^(?:move\s+(?:mouse|cursor)\s+(?:to\s+)?|cursor\s+(?:to\s+)?)(-?\d+)[,\s]+(-?\d+)$/i);
  if (mouseMoveMatch) {
    const x = parseInt(mouseMoveMatch[1], 10);
    const y = parseInt(mouseMoveMatch[2], 10);
    return {
      toolName: 'gui_move',
      args: { x, y },
      statusText: `Moving cursor to (${x}, ${y})...`,
      completedMessage: `Cursor moved to (${x}, ${y}).`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // Center cursor: "center cursor", "center mouse", "move cursor to center"
  const centerMatch = target.match(/^(?:center\s+(?:mouse|cursor)|move\s+(?:mouse|cursor)\s+to\s+center)$/i);
  if (centerMatch) {
    return {
      toolName: 'gui_move',
      args: { x: 720, y: 450 },
      statusText: 'Centering cursor on screen...',
      completedMessage: 'Cursor centered on screen.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // Mouse click: "click at 500 300", "double click 500 300", "right click", "click"
  const mouseClickMatch = target.match(/^(?:(left|right|double)\s+)?click(?:\s+(?:mouse|cursor|at))?(?:\s+(-?\d+)[,\s]+(-?\d+))?$/i);
  if (mouseClickMatch) {
    const modifier = (mouseClickMatch[1] || '').toLowerCase();
    const x = mouseClickMatch[2] !== undefined ? parseInt(mouseClickMatch[2], 10) : undefined;
    const y = mouseClickMatch[3] !== undefined ? parseInt(mouseClickMatch[3], 10) : undefined;
    const isRight = modifier === 'right' || /\bright\b/i.test(target);
    const isDouble = modifier === 'double' || /\bdouble\b/i.test(target);
    return {
      toolName: 'gui_click',
      args: { x, y, button: isRight ? 'right' : 'left', double: isDouble },
      statusText: `${isDouble ? 'Double-clicking' : isRight ? 'Right-clicking' : 'Clicking'}${x !== undefined ? ` at (${x}, ${y})` : ''}...`,
      completedMessage: `${isDouble ? 'Double-clicked' : isRight ? 'Right-clicked' : 'Clicked'}${x !== undefined ? ` at (${x}, ${y})` : ''}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // Mouse drag: "drag mouse from 100 100 to 500 500", "drag from 100,100 to 500,500"
  const mouseDragMatch = target.match(/^(?:drag(?:\s+mouse)?\s+from\s+)(-?\d+)[,\s]+(-?\d+)\s+to\s+(-?\d+)[,\s]+(-?\d+)$/i);
  if (mouseDragMatch) {
    const startX = parseInt(mouseDragMatch[1], 10);
    const startY = parseInt(mouseDragMatch[2], 10);
    const endX = parseInt(mouseDragMatch[3], 10);
    const endY = parseInt(mouseDragMatch[4], 10);
    return {
      toolName: 'gui_drag',
      args: { startX, startY, endX, endY },
      statusText: `Dragging from (${startX}, ${startY}) to (${endX}, ${endY})...`,
      completedMessage: `Dragged from (${startX}, ${startY}) to (${endX}, ${endY}).`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 16. Puppeteer Browser Automation Workflows (works with or without the word 'puppeteer')
  // Pattern A: Search and screenshot (e.g. "search for MrBeast and save screenshot as mrbeast.png")
  const puppeteerSearchNavMatch = target.match(
    /^(?:puppeteer\s+)?(?:headed\s+|visible\s+)?(?:search\s+(?:for\s+)?|find\s+)(.+?)\s+and\s+(?:take\s+|save\s+)?screenshot\s+(?:to|as)\s+([^\s]+)$/i
  );
  if (puppeteerSearchNavMatch && puppeteerSearchNavMatch[1] && puppeteerSearchNavMatch[2]) {
    const query = puppeteerSearchNavMatch[1].trim();
    const outputPath = puppeteerSearchNavMatch[2].trim();
    const headed = /\b(?:headed|visible|show browser)\b/i.test(target);
    return {
      toolName: 'puppeteer_search_and_navigate',
      args: {
        query,
        outputPath,
        engine: 'duckduckgo',
        headless: !headed,
      },
      statusText: `Automating search for "${query}" and capturing screenshot to ${outputPath}...`,
      completedMessage: `Automated browser workflow completed and saved to ${outputPath}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // Pattern B: Direct page screenshot (e.g. "take screenshot of https://github.com to github.png")
  const puppeteerScreenshotMatch = target.match(
    /^(?:puppeteer\s+)?(?:headed\s+|visible\s+)?(?:take\s+)?screenshot\s+(?:of\s+)?(https?:\/\/[^\s]+)(?:\s+(?:to|as)\s+([^\s]+))?$/i
  );
  if (puppeteerScreenshotMatch && puppeteerScreenshotMatch[1]) {
    const url = puppeteerScreenshotMatch[1].trim();
    const outputPath = (puppeteerScreenshotMatch[2] || 'screenshot.png').trim();
    const headed = /\b(?:headed|visible|show browser)\b/i.test(target);
    return {
      toolName: 'puppeteer_screenshot',
      args: {
        url,
        outputPath,
        headless: !headed,
      },
      statusText: `Capturing headless screenshot of ${url}...`,
      completedMessage: `Screenshot of ${url} captured to ${outputPath}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // Pattern C: Headless Page Scraping (e.g. "scrape content from https://news.ycombinator.com" or "puppeteer scrape https://example.com")
  const puppeteerScrapeMatch = target.match(
    /^(?:puppeteer\s+)?(?:scrape(?:\s+(?:text|data|content)\s+from|\s+from|\s+content\s+from)?|extract\s+(?:text|data|content)\s+from)\s+(https?:\/\/[^\s]+)(?:\s+(?:using|selector)\s+([^\s]+))?$/i
  );
  if (puppeteerScrapeMatch && puppeteerScrapeMatch[1]) {
    const url = puppeteerScrapeMatch[1].trim();
    const selector = puppeteerScrapeMatch[2]?.trim();
    return {
      toolName: 'puppeteer_action',
      args: {
        action: 'scrape',
        url,
        selector: selector || 'body',
        headless: true,
      },
      statusText: `Scraping content from ${url}...`,
      completedMessage: `Scraped content from ${url}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // Pattern D: PDF Generation (e.g. "save page https://example.com as pdf example.pdf")
  const puppeteerPdfMatch = target.match(
    /^(?:puppeteer\s+)?(?:save\s+page\s+|print\s+)?(https?:\/\/[^\s]+)\s+(?:as|to)\s+pdf\s+([^\s]+)$/i
  );
  if (puppeteerPdfMatch && puppeteerPdfMatch[1] && puppeteerPdfMatch[2]) {
    const url = puppeteerPdfMatch[1].trim();
    const outputPath = puppeteerPdfMatch[2].trim();
    return {
      toolName: 'puppeteer_action',
      args: {
        action: 'pdf',
        url,
        outputPath,
        headless: true,
      },
      statusText: `Generating PDF of ${url} to ${outputPath}...`,
      completedMessage: `Saved PDF of ${url} to ${outputPath}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 17. Window Management Controls
  if (/^(?:maximize|fullscreen)(?:\s+(?:the\s+|active\s+)?window)?$/i.test(target)) {
    return {
      toolName: 'manage_window',
      args: { action: 'maximize' },
      statusText: 'Maximizing active window...',
      completedMessage: 'Active window maximized.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:minimize)(?:\s+(?:the\s+|active\s+)?window)?$/i.test(target)) {
    return {
      toolName: 'manage_window',
      args: { action: 'minimize' },
      statusText: 'Minimizing active window...',
      completedMessage: 'Active window minimized.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  const tileMatch = target.match(/^(?:tile|snap)(?:\s+(?:the\s+|active\s+)?window)?\s+(?:to\s+(?:the\s+)?)?(left|right)$/i);
  if (tileMatch) {
    const dir = tileMatch[1].toLowerCase() as 'left' | 'right';
    return {
      toolName: 'manage_window',
      args: { action: `tile_${dir}` },
      statusText: `Tiling active window to the ${dir}...`,
      completedMessage: `Active window tiled ${dir}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:center)(?:\s+(?:the\s+|active\s+)?window)?$/i.test(target)) {
    return {
      toolName: 'manage_window',
      args: { action: 'center' },
      statusText: 'Centering active window...',
      completedMessage: 'Active window centered on display.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 18. Local File Search via OS Indexer (Spotlight mdfind / Windows Search)
  const fileSearchMatch = target.match(/^(?:find\s+file|locate\s+file|search\s+(?:local\s+)?files?(?:\s+(?:for|named))?)\s+([^\s]+)$/i);
  if (fileSearchMatch && fileSearchMatch[1]) {
    const query = fileSearchMatch[1].trim();
    return {
      toolName: 'search_local_files',
      args: { query },
      statusText: `Searching local files for "${query}" via native indexer...`,
      completedMessage: `Local file search completed for "${query}".`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 19. System Power and Battery Status Query
  if (/^(?:(?:check|get|what(?:'s|\s+is))\s+(?:my\s+|the\s+)?(?:battery(?:\s+level|\s+percentage|\s+status)?|power(?:\s+status|\s+level)?)|(?:battery|power)(?:\s+status|\s+percentage|\s+level)?)$/i.test(target)) {
    return {
      toolName: 'get_power_status',
      args: {},
      statusText: 'Querying system battery and power telemetry...',
      completedMessage: 'System battery status retrieved.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 20. Explicit System Volume Percentage
  const volPctMatch = target.match(/^(?:set\s+)?(?:system\s+)?volume\s+(?:to\s+)?(\d{1,3})%?$/i);
  if (volPctMatch && volPctMatch[1]) {
    const level = Math.min(100, Math.max(0, parseInt(volPctMatch[1], 10)));
    return {
      toolName: 'set_system_volume',
      args: { level },
      statusText: `Setting system volume to ${level}%...`,
      completedMessage: `System volume set to ${level}%.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 21. Active App & Window Context Query
  if (/^(?:what\s+app\s+am\s+i\s+using|what(?:'s|\s+is)\s+(?:the\s+)?(?:active|current|frontmost)\s+(?:app|application|window)|active\s+(?:window|app)|current\s+(?:app|window)|inspect\s+(?:active\s+|current\s+)?(?:app|window))$/i.test(target)) {
    return {
      toolName: 'get_active_window_context',
      args: {},
      statusText: 'Inspecting frontmost application and active window context...',
      completedMessage: 'Active window context retrieved.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 22. Hardware Telemetry & Performance Query
  if (/^(?:(?:check|get|what(?:'s|\s+is))\s+(?:my\s+|the\s+)?(?:system\s+(?:performance|telemetry|status|health)|hardware\s+(?:stats|telemetry|status)|cpu(?:\s+usage|\s+load)?|ram(?:\s+usage)?|memory\s+usage)|(?:system\s+(?:performance|telemetry|status|health)|hardware\s+stats|cpu\s+usage|ram\s+usage|memory\s+usage|disk\s+space|top\s+processes))$/i.test(target)) {
    return {
      toolName: 'get_hardware_telemetry',
      args: {},
      statusText: 'Collecting hardware performance & telemetry metrics...',
      completedMessage: 'System hardware telemetry retrieved.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 23. Global Keyboard Shortcuts Info
  if (/^(?:(?:show|list|what\s+are)\s+(?:the\s+)?(?:keyboard\s+)?(?:shortcuts|hotkeys)|keyboard\s+shortcuts|hotkeys)$/i.test(target)) {
    return {
      toolName: 'get_global_shortcuts',
      args: {},
      statusText: 'Retrieving registered global shortcuts and hotkeys...',
      completedMessage: 'Registered global shortcuts retrieved.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  return null;
}


