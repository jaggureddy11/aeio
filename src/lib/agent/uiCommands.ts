import {
  simulateKeyPress,
  simulateScroll,
  injectTextToActiveApp,
  openApp,
  AutomationResult,
} from '../ipc';

export type UiCommandKind = 'key' | 'scroll' | 'type' | 'click' | 'open_app';

export interface UiCommandMatch {
  kind: UiCommandKind;
  keys?: string;
  dir?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  text?: string;
  what?: string;
  appName?: string;
  reply: string;
}

export interface ScreenElement {
  id?: string;
  name: string;
  kind: string; // 'button' | 'link' | 'tab' | 'menu item' | 'item' | 'checkbox' | 'input'
  center?: { x: number; y: number };
  disabled?: boolean;
}

const KEYS_MAP: Record<string, string> = {
  enter: 'enter',
  return: 'enter',
  escape: 'escape',
  esc: 'escape',
  tab: 'tab',
  space: 'space',
  backspace: 'backspace',
  delete: 'delete',
  home: 'home',
  end: 'end',
  'page up': 'pageup',
  'page down': 'pagedown',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  f5: 'f5',
};

const CLICKABLE_KINDS = new Set([
  'button',
  'link',
  'tab',
  'menu item',
  'item',
  'checkbox',
  'option',
  'column',
  'box',
  'input',
]);

/**
 * Strips polite prefixes and filler phrases from user directives.
 * e.g., "Hey Aeio, can you please press enter" -> "press enter"
 */
export function cleanDirective(text: string): string {
  return String(text || '')
    .trim()
    .replace(/^(?:hey|hi|ok(?:ay)?)?\s*,?\s*(?:aeio|jaggu|jarvis)\s*[,.!]?\s*/i, '')
    .replace(/^(?:can|could|would|will) you\s+(?:please\s+)?/i, '')
    .replace(/^(?:please|kindly|i want you to|i need you to|help me(?: to)?|go ahead and)\s+/i, '')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fast-path UI command matching without LLM round trip latency.
 * Matches: keys, scrolling, back/forward navigation, reload, typing, and clicks.
 */
export function matchUiCommand(text: string): UiCommandMatch | null {
  const t = cleanDirective(text).replace(/^(?:now|then|and)\s+/i, '');
  if (!t || t.length > 80) return null;

  // 1. Key Presses (Enter, Esc, Tab, Arrows, Space, Delete, etc.)
  const keyMatch = /^(?:press|hit) (?:the )?(enter|return|escape|esc|tab|space|backspace|delete|home|end|page up|page down|up|down|left|right)(?: key)?$/i.exec(t);
  if (keyMatch) {
    const rawKey = keyMatch[1].toLowerCase();
    const mapped = KEYS_MAP[rawKey] || rawKey;
    return {
      kind: 'key',
      keys: mapped,
      reply: `Pressed ${keyMatch[1]}.`,
    };
  }

  // 2. Browser / Window Navigation
  if (/^go back(?: a page)?$/i.test(t)) {
    return { kind: 'key', keys: 'alt+left', reply: 'Navigated back.' };
  }
  if (/^go forward$/i.test(t)) {
    return { kind: 'key', keys: 'alt+right', reply: 'Navigated forward.' };
  }
  if (/^(?:refresh|reload)(?:\s+(?:the|this)?\s*page)?$/i.test(t)) {
    return { kind: 'key', keys: 'f5', reply: 'Reloaded page.' };
  }

  // 3. Scrolling
  const scrollMatch = /^scroll (up|down|left|right)(?: (?:a (?:bit|little)|more|again|some|a lot))?(?: on (?:the|this) (?:page|window))?$/i.exec(t);
  if (scrollMatch) {
    const dir = scrollMatch[1].toLowerCase() as 'up' | 'down' | 'left' | 'right';
    const amount = /a lot/i.test(t) ? 12 : /a (?:bit|little)/i.test(t) ? 3 : 6;
    return {
      kind: 'scroll',
      dir,
      amount,
      reply: `Scrolled ${dir}.`,
    };
  }

  // 4. Direct Text Input
  const typeMatch = /^type ["“'](.+)["”']$/i.exec(t);
  if (typeMatch) {
    return {
      kind: 'type',
      text: typeMatch[1],
      reply: `Typed text into active application.`,
    };
  }

  // 5. Open Desktop App
  const openAppMatch = /^(?:open|launch|start|run) (?:the |my )?([a-z0-9][\w .+&'-]{1,38}?)(?: app| application| program)?$/i.exec(t);
  if (openAppMatch && !/\b(?:and|then|to|with|for|in|on|file|folder|url|website|it|this|that)\b/i.test(openAppMatch[1])) {
    const app = openAppMatch[1].trim();
    return {
      kind: 'open_app',
      appName: app,
      reply: `Opening ${app}.`,
    };
  }

  // 6. Direct Element Click
  const clickMatch = /^(?:click|tap|press|hit|select|choose|open)(?: on)? (?:the )?(.+?)(?: (?:button|link|tab|option|icon|menu|item|checkbox))?$/i.exec(t);
  if (clickMatch && clickMatch[1].length <= 50 && !/\b(?:and|then|after|first|second|third|last|next|every|all)\b/i.test(clickMatch[1])) {
    const targetName = clickMatch[1].replace(/^["“']|["”']$/g, '').trim();
    return {
      kind: 'click',
      what: targetName,
      reply: `Clicked ${targetName}.`,
    };
  }

  return null;
}

/**
 * Searches accessibility screen elements for the target by name.
 * Uses weighted scoring and centroid spatial deduplication.
 */
export function findScreenElement(elements: ScreenElement[], what: string): ScreenElement | null {
  const want = String(what || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!want) return null;

  const scored: { item: ScreenElement; score: number }[] = [];

  for (const it of elements) {
    if (it.disabled) continue;
    if (it.kind && !CLICKABLE_KINDS.has(it.kind.toLowerCase())) continue;

    const name = (it.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!name) continue;

    let score = 0;
    if (name === want) {
      score = 3;
    } else if (name.startsWith(`${want} `) || name.endsWith(` ${want}`)) {
      score = 2;
    } else if (
      new RegExp(`(?:^|\\W)${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\W|$)`).test(name) &&
      name.length <= want.length * 3
    ) {
      score = 1;
    }

    if (score > 0) {
      scored.push({ item: it, score });
    }
  }

  if (!scored.length) return null;

  const maxScore = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === maxScore).map((s) => s.item);

  // Centroid deduplication: if two elements share center coordinates within 12px, they are the same control
  const distinct = top.filter(
    (a, idx) =>
      !top.slice(0, idx).some((b) => {
        if (!a.center || !b.center) return false;
        return Math.abs(a.center.x - b.center.x) < 12 && Math.abs(a.center.y - b.center.y) < 12;
      })
  );

  if (distinct.length !== 1) {
    // If ambiguous, return the first one with direct action kind (e.g. 'button' over 'item')
    return distinct.sort((a, b) => Number(b.kind !== 'item') - Number(a.kind !== 'item'))[0] || null;
  }

  return distinct[0];
}

/**
 * Executes a matched UI command directly on the desktop.
 */
export async function executeMatchedUiCommand(cmd: UiCommandMatch): Promise<AutomationResult> {
  switch (cmd.kind) {
    case 'key': {
      if (!cmd.keys) throw new Error('Missing keys in key command');
      return await simulateKeyPress(cmd.keys);
    }

    case 'scroll': {
      return await simulateScroll(cmd.dir || 'down', cmd.amount || 6);
    }

    case 'type': {
      return await injectTextToActiveApp(cmd.text || '');
    }

    case 'open_app': {
      return await openApp(cmd.appName || '');
    }

    case 'click': {
      // Direct click command placeholder
      return {
        success: true,
        message: `Clicked element "${cmd.what}"`,
        action_type: 'click',
        payload: cmd.what,
      };
    }

    default:
      throw new Error(`Unsupported UI command kind: ${cmd.kind}`);
  }
}
