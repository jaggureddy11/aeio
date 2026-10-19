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

  // 1. Open / Launch desktop applications
  const openAppMatch = trimmed.match(/^(?:open|launch|start)\s+(?:the\s+)?([a-zA-Z0-9\s._-]+?)(?:\s+app|\s+application)?$/i);
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
  const volNumberMatch = trimmed.match(/^(?:set\s+)?(?:system\s+)?volume\s+(?:to\s+)?(\d{1,3})%?$/i);
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
  if (/^(?:volume\s+up|increase\s+volume|turn\s+up\s+volume)$/i.test(trimmed)) {
    return {
      toolName: 'set_system_volume',
      args: { level: 75 },
      statusText: 'Increasing system volume...',
      completedMessage: 'System volume increased.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:volume\s+down|decrease\s+volume|lower\s+volume|turn\s+down\s+volume)$/i.test(trimmed)) {
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
  if (/^(?:mute|mute\s+volume|silence)$/i.test(trimmed)) {
    return {
      toolName: 'set_system_mute',
      args: { mute: true },
      statusText: 'Muting system volume...',
      completedMessage: 'System volume muted.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:unmute|unmute\s+volume)$/i.test(trimmed)) {
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
  if (/^(?:play|resume|play\s+music|resume\s+music)$/i.test(trimmed)) {
    return {
      toolName: 'media_control',
      args: { action: 'play' },
      statusText: 'Resuming media playback...',
      completedMessage: 'Media playback resumed.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:pause|stop\s+music|pause\s+music)$/i.test(trimmed)) {
    return {
      toolName: 'media_control',
      args: { action: 'pause' },
      statusText: 'Pausing media playback...',
      completedMessage: 'Media playback paused.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:next\s+track|next\s+song|skip\s+song|skip\s+track)$/i.test(trimmed)) {
    return {
      toolName: 'media_control',
      args: { action: 'next' },
      statusText: 'Skipping to next track...',
      completedMessage: 'Skipped to next track.',
      isDestructive: false,
      riskTier: 'low',
    };
  }

  if (/^(?:previous\s+track|previous\s+song|prev\s+track)$/i.test(trimmed)) {
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
  const compoundBrowserMatch = trimmed.match(
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
  const playInAppMatch = trimmed.match(
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
  const openInAppMatch = trimmed.match(
    /^(?:open|launch)\s+(youtube|spotify|netflix|github|google|chatgpt|twitter|x|reddit|https?:\/\/\S+)\s+in\s+([a-zA-Z0-9\s._-]+?)$/i
  );
  if (openInAppMatch) {
    const target = openInAppMatch[1].trim();
    const app = openInAppMatch[2].trim();
    const lower = target.toLowerCase();
    const isUrl = lower.startsWith('http://') || lower.startsWith('https://');

    return {
      toolName: 'search_web',
      args: { query: isUrl ? target : '', platform: isUrl ? 'url' : lower, app },
      statusText: `Opening ${target} in ${app}...`,
      completedMessage: `Opened ${target} in ${app}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 6. YouTube playback and search
  const ytPlayMatch = trimmed.match(/^(?:play\s+)?(.+?)\s+(?:on\s+youtube|in\s+youtube)$/i);
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

  const ytSearchMatch = trimmed.match(/^(?:search\s+youtube\s+for|youtube)\s+(.+)$/i);
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
  const spotifyMatch = trimmed.match(/^(?:play\s+)?(.+?)\s+(?:on\s+spotify|in\s+spotify)$/i);
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
  const webSearchMatch = trimmed.match(/^(?:search\s+(?:the\s+)?web\s+for|search\s+google\s+for|google)\s+(.+)$/i);
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
  if (/^(?:lock\s+screen|lock\s+mac|lock\s+computer|lock\s+desktop)$/i.test(trimmed)) {
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
  const mathCalcMatch = trimmed.match(/^(?:calculate|compute|evaluate|what\s+is)\s+([0-9+\-*/^().\s]{3,})$/i);
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
  if (/^\s*\d+(?:\.\d+)?\s*[+\-*/^]\s*\d+(?:\.\d+)?(?:\s*[+\-*/^]\s*\d+(?:\.\d+)?)*\s*$/.test(trimmed)) {
    return {
      toolName: 'math_evaluate',
      args: { expression: trimmed },
      statusText: `Evaluating ${trimmed}...`,
      completedMessage: `Evaluated ${trimmed}.`,
      isDestructive: false,
      riskTier: 'low',
    };
  }

  // 10. Direct URL or File Path Opening (open_target)
  const urlMatch = trimmed.match(/^(?:open|navigate\s+to|go\s+to)\s+(https?:\/\/[^\s]+)$/i);
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

  const filePathMatch = trimmed.match(/^(?:open\s+(?:file|folder|directory)\s+|open\s+)([\/~][^\s]+)$/i);
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
  if (/^(?:read\s+clipboard|get\s+clipboard|check\s+clipboard|show\s+clipboard|view\s+clipboard|what(?:'s|\s+is)\s+on\s+my\s+clipboard)$/i.test(trimmed)) {
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
  if (/^(?:get\s+volume|check\s+volume|current\s+volume|what(?:'s|\s+is)\s+the\s+volume)$/i.test(trimmed)) {
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
  const keyPressMatch = trimmed.match(/^(?:press|hit)\s+(enter|return|space|spacebar|esc|escape|tab)$/i);
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
  const scrollMatch = trimmed.match(/^(?:scroll\s+(down|up|left|right)|scroll\s+page\s+(down|up))$/i);
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
  const mouseMoveMatch = trimmed.match(/^(?:move\s+(?:mouse|cursor)\s+(?:to\s+)?|cursor\s+(?:to\s+)?)(-?\d+)[,\s]+(-?\d+)$/i);
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
  const centerMatch = trimmed.match(/^(?:center\s+(?:mouse|cursor)|move\s+(?:mouse|cursor)\s+to\s+center)$/i);
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
  const mouseClickMatch = trimmed.match(/^(?:(left|right|double)\s+)?click(?:\s+(?:mouse|cursor|at))?(?:\s+(-?\d+)[,\s]+(-?\d+))?$/i);
  if (mouseClickMatch) {
    const modifier = (mouseClickMatch[1] || '').toLowerCase();
    const x = mouseClickMatch[2] !== undefined ? parseInt(mouseClickMatch[2], 10) : undefined;
    const y = mouseClickMatch[3] !== undefined ? parseInt(mouseClickMatch[3], 10) : undefined;
    const isRight = modifier === 'right' || /\bright\b/i.test(trimmed);
    const isDouble = modifier === 'double' || /\bdouble\b/i.test(trimmed);
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
  const mouseDragMatch = trimmed.match(/^(?:drag(?:\s+mouse)?\s+from\s+)(-?\d+)[,\s]+(-?\d+)\s+to\s+(-?\d+)[,\s]+(-?\d+)$/i);
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
  const puppeteerSearchNavMatch = trimmed.match(
    /^(?:puppeteer\s+)?(?:headed\s+|visible\s+)?(?:search\s+(?:for\s+)?|find\s+)(.+?)\s+and\s+(?:take\s+|save\s+)?screenshot\s+(?:to|as)\s+([^\s]+)$/i
  );
  if (puppeteerSearchNavMatch && puppeteerSearchNavMatch[1] && puppeteerSearchNavMatch[2]) {
    const query = puppeteerSearchNavMatch[1].trim();
    const outputPath = puppeteerSearchNavMatch[2].trim();
    const headed = /\b(?:headed|visible|show browser)\b/i.test(trimmed);
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
  const puppeteerScreenshotMatch = trimmed.match(
    /^(?:puppeteer\s+)?(?:headed\s+|visible\s+)?(?:take\s+)?screenshot\s+(?:of\s+)?(https?:\/\/[^\s]+)(?:\s+(?:to|as)\s+([^\s]+))?$/i
  );
  if (puppeteerScreenshotMatch && puppeteerScreenshotMatch[1]) {
    const url = puppeteerScreenshotMatch[1].trim();
    const outputPath = (puppeteerScreenshotMatch[2] || 'screenshot.png').trim();
    const headed = /\b(?:headed|visible|show browser)\b/i.test(trimmed);
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
  const puppeteerScrapeMatch = trimmed.match(
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
  const puppeteerPdfMatch = trimmed.match(
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

  return null;
}
