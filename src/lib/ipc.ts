import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export const isTauri = (): boolean => {
  const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  if (g?.process?.env?.VITEST) {
    return true;
  }
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    return handleWebFallback<T>(cmd, args);
  }
  return args !== undefined ? tauriInvoke<T>(cmd, args) : tauriInvoke<T>(cmd);
}

function handleWebFallback<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (cmd === 'list_workspaces') {
    return Promise.resolve([
      {
        id: 'default',
        name: 'Default',
        icon: '💼',
        description: 'Default Workspace',
        is_active: true,
        is_archived: false,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ] as unknown as T);
  }
  if (cmd === 'get_active_workspace') {
    return Promise.resolve({
      id: 'default',
      name: 'Default',
      icon: '💼',
      description: 'Default Workspace',
      is_active: true,
      is_archived: false,
      created_at: Date.now(),
      updated_at: Date.now(),
    } as unknown as T);
  }
  if (cmd === 'load_chat_messages') {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('aeio_browser_chat_history') : null;
      return Promise.resolve(stored ? JSON.parse(stored) : ([] as unknown as T));
    } catch {
      return Promise.resolve([] as unknown as T);
    }
  }
  if (cmd === 'save_chat_message') {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('aeio_browser_chat_history');
        const list = stored ? JSON.parse(stored) : [];
        if (args && args.message) {
          list.push(args.message);
          localStorage.setItem('aeio_browser_chat_history', JSON.stringify(list));
        }
      }
    } catch {}
    return Promise.resolve(undefined as unknown as T);
  }
  if (cmd === 'clear_chat_history') {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('aeio_browser_chat_history');
      }
    } catch {}
    return Promise.resolve(undefined as unknown as T);
  }
  if (cmd === 'search_memories' || cmd === 'list_memories' || cmd === 'list_audit_receipts') {
    return Promise.resolve([] as unknown as T);
  }
  if (cmd === 'get_system_status') {
    return Promise.resolve({
      os_name: 'macos',
      battery_level: 100,
      is_charging: true,
      active_app: 'Browser',
      dark_mode: true,
      disk_available_gb: 128,
      disk_percent_used: 50,
      memory_available_mb: 8192,
    } as unknown as T);
  }
  if (
    cmd === 'is_ai_grounding_available' ||
    cmd === 'has_api_key' ||
    cmd === 'delete_api_key' ||
    cmd === 'delete_memory' ||
    cmd === 'check_destructive_command' ||
    cmd === 'get_kill_switch_state'
  ) {
    return Promise.resolve(false as unknown as T);
  }
  if (cmd === 'get_api_key') {
    try {
      if (typeof localStorage !== 'undefined' && args?.target) {
        const val =
          localStorage.getItem(`aeio_key_${args.target}`) ||
          localStorage.getItem(`aeio_${args.target}`) ||
          (args.target === 'bedrock' ? localStorage.getItem('aeio_bedrock_credentials') : null);
        if (val) return Promise.resolve(val as unknown as T);
      }
    } catch {}
    return Promise.resolve('' as unknown as T);
  }
  if (cmd === 'set_api_key') {
    try {
      if (typeof localStorage !== 'undefined' && args?.target) {
        localStorage.setItem(`aeio_key_${args.target}`, String(args.key ?? ''));
      }
    } catch {}
    return Promise.resolve(undefined as unknown as T);
  }
  if (cmd === 'has_api_key') {
    try {
      if (typeof localStorage !== 'undefined' && args?.target) {
        const val =
          localStorage.getItem(`aeio_key_${args.target}`) ||
          localStorage.getItem(`aeio_${args.target}`) ||
          (args.target === 'bedrock' ? localStorage.getItem('aeio_bedrock_credentials') : null);
        return Promise.resolve(!!val as unknown as T);
      }
    } catch {}
    return Promise.resolve(false as unknown as T);
  }
  if (cmd === 'speak_text') {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
        window.speechSynthesis.resume();
        const text = String(args?.text || '');
        const u = new SpeechSynthesisUtterance(text);
        (window as any).__aeioWebUtterance = u;
        const voices = window.speechSynthesis.getVoices();
        const v =
          voices.find((x) => x.name === 'Samantha' || x.name.includes('Samantha')) ||
          voices.find((x) => x.name.includes('Google US English')) ||
          voices.find((x) => x.name.includes('Alex')) ||
          voices.find((x) => x.lang.startsWith('en') && !x.name.includes('Rishi')) ||
          voices[0];
        if (v) u.voice = v;
        u.volume = 1.0;
        u.rate = 1.0;
        u.onend = () => {
          (window as any).__aeioWebUtterance = null;
        };
        u.onerror = () => {
          (window as any).__aeioWebUtterance = null;
        };
        window.speechSynthesis.speak(u);
        window.speechSynthesis.resume();
        return Promise.resolve({ success: true, message: 'Spoken in browser', voiceUsed: v?.name || 'default' } as unknown as T);
      } catch (e: any) {
        return Promise.resolve({ success: false, message: String(e), voiceUsed: 'none' } as unknown as T);
      }
    }
    return Promise.resolve({ success: true, message: 'Speech unavailable', voiceUsed: 'none' } as unknown as T);
  }
  if (cmd === 'stop_speaking') {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        (window as any).__aeioWebUtterance = null;
      } catch {}
    }
    return Promise.resolve(undefined as unknown as T);
  }
  if (
    cmd === 'read_clipboard' ||
    cmd === 'open_target' ||
    cmd === 'ping' ||
    cmd === 'get_local_logs' ||
    cmd === 'get_telemetry_logs'
  ) {
    return Promise.resolve('' as unknown as T);
  }
  return Promise.resolve({} as unknown as T);
}

export type MemoryCategory = 'fact' | 'preference' | 'project' | 'person';

export interface Workspace {
  id: string;
  name: string;
  icon?: string | null;
  description?: string | null;
  is_active: boolean;
  is_archived: boolean;
  created_at: number;
  updated_at: number;
}

export interface MemoryRecord {
  id: string;
  content: string;
  category: MemoryCategory;
  embedding?: number[] | null;
  workspace_id?: string | null;
  created_at: number;
  updated_at: number;
}

export interface MemorySearchResult {
  memory: MemoryRecord;
  score: number;
}

// Workspace Management (Tier 4)
export async function listWorkspaces(includeArchived: boolean = false): Promise<Workspace[]> {
  return invoke<Workspace[]>('list_workspaces', { includeArchived });
}

export async function createWorkspace(
  name: string,
  icon?: string,
  description?: string
): Promise<Workspace> {
  return invoke<Workspace>('create_workspace', { name, icon, description });
}

export async function updateWorkspace(
  id: string,
  name: string,
  icon?: string,
  description?: string
): Promise<Workspace> {
  return invoke<Workspace>('update_workspace', { id, name, icon, description });
}

export async function archiveWorkspace(id: string, archived: boolean = true): Promise<void> {
  return invoke<void>('archive_workspace', { id, archived });
}

export async function setActiveWorkspace(id: string): Promise<void> {
  return invoke<void>('set_active_workspace', { id });
}

export async function getActiveWorkspace(): Promise<Workspace> {
  return invoke<Workspace>('get_active_workspace');
}

// Memory Operations
export async function addMemory(
  content: string,
  category: MemoryCategory,
  workspaceId?: string
): Promise<MemoryRecord> {
  return invoke<MemoryRecord>('add_memory', {
    content,
    category,
    workspaceId: workspaceId ?? null,
  });
}

export async function listMemories(
  category?: MemoryCategory,
  workspaceId?: string
): Promise<MemoryRecord[]> {
  return invoke<MemoryRecord[]>('list_memories', {
    category: category ?? null,
    workspaceId: workspaceId ?? null,
  });
}

export async function updateMemory(
  id: string,
  content: string,
  category: MemoryCategory,
  workspaceId?: string
): Promise<MemoryRecord> {
  return invoke<MemoryRecord>('update_memory', {
    id,
    content,
    category,
    workspaceId: workspaceId ?? null,
  });
}

export async function deleteMemory(id: string): Promise<boolean> {
  return invoke<boolean>('delete_memory', { id });
}

export async function searchMemories(
  query: string,
  workspaceId?: string,
  crossWorkspace: boolean = false,
  limit: number = 5
): Promise<MemorySearchResult[]> {
  return invoke<MemorySearchResult[]>('search_memories', {
    query,
    workspaceId: workspaceId ?? null,
    crossWorkspace,
    limit,
  });
}

// Tool Types & Methods
export interface FileMatch {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
}

export interface ShellOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
  is_destructive: boolean;
}

export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

export async function writeFile(path: string, content: string): Promise<string> {
  try {
    return await invoke<string>('write_file', { path, content });
  } catch (err) {
    if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
      return `[Preview] Wrote ${content.length} bytes to ${path}`;
    }
    throw err;
  }
}

export async function fetchUrl(url: string): Promise<string> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('Only http:// and https:// URLs are supported.');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Aeio-Desktop/1.0 (Local-First Assistant)',
        'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain,application/json;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const text = await res.text();
    const MAX_LEN = 100_000;
    if (text.length > MAX_LEN) {
      return text.slice(0, MAX_LEN) + `\n\n[Output truncated at 100KB (${text.length} total bytes)]`;
    }
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function searchFiles(dir: string, query: string): Promise<FileMatch[]> {
  return invoke<FileMatch[]>('search_files', { dir, query });
}

export async function readClipboard(): Promise<string> {
  return invoke<string>('read_clipboard');
}

export async function writeClipboard(text: string): Promise<void> {
  return invoke<void>('write_clipboard', { text });
}

export async function checkDestructiveCommand(command: string): Promise<boolean> {
  return invoke<boolean>('check_destructive_command', { command });
}

export async function runShellCommand(command: string, cwd?: string): Promise<ShellOutput> {
  return invoke<ShellOutput>('run_shell_command', { command, cwd });
}

export async function openTarget(target: string): Promise<string> {
  return invoke<string>('open_target', { target });
}

export interface ActiveWindowInfo {
  app_name: string;
  title: string;
}

export async function getActiveWindow(): Promise<ActiveWindowInfo> {
  return invoke<ActiveWindowInfo>('get_active_window');
}

// Secure OS Keychain Methods (Zero-plaintext BYOK storage)
export async function getApiKey(target: string): Promise<string> {
  return invoke<string>('get_api_key', { target });
}

export async function setApiKey(target: string, key: string): Promise<void> {
  return invoke<void>('set_api_key', { target, key });
}

export async function deleteApiKey(target: string): Promise<boolean> {
  return invoke<boolean>('delete_api_key', { target });
}

export async function hasApiKey(target: string): Promise<boolean> {
  return invoke<boolean>('has_api_key', { target });
}

// Chat Persistence & Memory Export (Tier 0 & Tier 4 Workspace Scoped)
export interface SavedChatMessage {
  id: string;
  role: string;
  content: string;
  recalled_memories_json?: string | null;
  proposed_memories_json?: string | null;
  tool_executions_json?: string | null;
  provider_info_json?: string | null;
  workspace_id?: string | null;
  timestamp: number;
}

export async function saveChatMessage(message: SavedChatMessage): Promise<void> {
  return invoke<void>('save_chat_message', { message });
}

export async function loadChatMessages(
  workspaceId?: string,
  limit?: number
): Promise<SavedChatMessage[]> {
  return invoke<SavedChatMessage[]>('load_chat_messages', {
    workspaceId: workspaceId ?? null,
    limit,
  });
}

export async function clearChatHistory(workspaceId?: string): Promise<void> {
  return invoke<void>('clear_chat_history', { workspaceId: workspaceId ?? null });
}

export async function exportMemories(
  format: 'json' | 'markdown',
  workspaceId?: string
): Promise<string> {
  return invoke<string>('export_memories', {
    format,
    workspaceId: workspaceId ?? null,
  });
}

export async function ping(): Promise<string> {
  return invoke<string>('ping');
}

export interface TelemetryPayload {
  anonymous_id: string;
  timestamp: string;
  app_version: string;
  os: string;
  arch: string;
  error_type: string;
  error_message: string;
  sanitized_stack: string;
  model_name?: string | null;
}

export async function recordError(
  errorName: string,
  message: string,
  stack?: string,
  optIn?: boolean,
  modelName?: string
): Promise<TelemetryPayload | null> {
  return invoke<TelemetryPayload | null>('record_error', {
    errorName,
    message,
    stack: stack ?? null,
    optIn: optIn ?? false,
    modelName: modelName ?? null,
  });
}

export async function getLocalLogs(): Promise<string> {
  return invoke<string>('get_local_logs');
}

export async function getTelemetryLogs(): Promise<string> {
  return invoke<string>('get_telemetry_logs');
}

export async function clearLocalLogs(): Promise<void> {
  return invoke<void>('clear_local_logs');
}

export async function hideWindow(): Promise<void> {
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await getCurrentWebviewWindow().hide();
  } catch (err) {
    console.debug('hideWindow not supported in browser environment', err);
  }
}

// System One Calibrated Intelligence (Native Rust Backend)
export interface SystemOneCommandSafetyVerdict {
  command: string;
  is_destructive: boolean;
  destructive_probability: number;
  requires_approval: boolean;
  risk_tier: 'low' | 'medium' | 'critical';
  rationale: string;
}

export interface SystemOneTaskIntentVerdict {
  prompt: string;
  primary_intent: 'planning' | 'code' | 'os_control' | 'private_notes' | 'search_retrieval' | 'conversational';
  recommended_route: 'local_first' | 'cloud_boost';
  suggested_provider: 'ollama' | 'claude' | 'gemini' | 'openai';
  probabilities: Record<string, number>;
  confidence: number;
  suggested_system_prompt?: string | null;
}

export interface SystemOneRerankedMemoryResult {
  memory_id: string;
  content: string;
  category: string;
  original_score: number;
  system_one_score: number;
  final_score: number;
  confidence: number;
  rationale: string;
}

export async function judgeCommandRisk(command: string): Promise<SystemOneCommandSafetyVerdict> {
  return invoke<SystemOneCommandSafetyVerdict>('judge_command_risk', { command });
}

export async function classifyUserTask(prompt: string): Promise<SystemOneTaskIntentVerdict> {
  return invoke<SystemOneTaskIntentVerdict>('classify_user_task', { prompt });
}

export async function rerankMemories(
  query: string,
  workspaceId?: string,
  crossWorkspace: boolean = false,
  limit: number = 15
): Promise<SystemOneRerankedMemoryResult[]> {
  return invoke<SystemOneRerankedMemoryResult[]>('rerank_memories', {
    query,
    workspaceId: workspaceId ?? null,
    crossWorkspace,
    limit,
  });
}

export async function systemOneEvaluate(request: any): Promise<any> {
  return invoke<any>('system_one_evaluate', { request });
}

// Voice & OS Automation Interfaces (JARVIS Desktop Engine)
export interface AutomationResult {
  success: boolean;
  message: string;
  action_type: string;
  payload?: string | null;
}

export interface VolumeStatus {
  volume: number;
  is_muted: boolean;
}

export async function setSystemVolume(level: number): Promise<AutomationResult> {
  return invoke<AutomationResult>('set_system_volume', { level: Math.round(level) });
}

export async function getSystemVolume(): Promise<VolumeStatus> {
  return invoke<VolumeStatus>('get_system_volume');
}

export async function setSystemMute(mute: boolean): Promise<AutomationResult> {
  return invoke<AutomationResult>('set_system_mute', { mute });
}

export async function playSpotify(query: string): Promise<AutomationResult> {
  return invoke<AutomationResult>('play_spotify', { query });
}

export async function mediaControl(action: string): Promise<AutomationResult> {
  return invoke<AutomationResult>('media_control', { action });
}

export async function searchWebPlatform(query: string, platform: string = 'google'): Promise<AutomationResult> {
  return invoke<AutomationResult>('search_web_platform', { query, platform });
}

export async function lockScreen(): Promise<AutomationResult> {
  return invoke<AutomationResult>('lock_screen');
}

export async function injectTextToActiveApp(text: string): Promise<AutomationResult> {
  return invoke<AutomationResult>('inject_text_to_active_app', { text });
}

export async function captureSelectedTextFromActiveApp(): Promise<string> {
  return invoke<string>('capture_selected_text_from_active_app');
}

export async function simulateKeyPress(key: string): Promise<AutomationResult> {
  return invoke<AutomationResult>('simulate_key_press', { key });
}

export async function simulateScroll(
  direction: 'up' | 'down' | 'left' | 'right',
  amount?: number
): Promise<AutomationResult> {
  return invoke<AutomationResult>('simulate_scroll', { direction, amount });
}

export async function openApp(name: string): Promise<AutomationResult> {
  return invoke<AutomationResult>('open_app', { name });
}

export interface SystemStatusInfo {
  os_name: string;
  battery_level?: number | null;
  is_charging?: boolean | null;
  active_app?: string | null;
  dark_mode?: boolean | null;
  disk_available_gb?: number | null;
  disk_percent_used?: number | null;
  memory_available_mb?: number | null;
}

export async function getSystemStatus(): Promise<SystemStatusInfo> {
  return invoke<SystemStatusInfo>('get_system_status');
}

export async function sendSystemNotification(title: string, message: string): Promise<AutomationResult> {
  return invoke<AutomationResult>('send_system_notification', { title, message });
}

export async function listRunningApps(): Promise<string[]> {
  return invoke<string[]>('list_running_apps');
}

export async function focusApp(name: string): Promise<AutomationResult> {
  return invoke<AutomationResult>('focus_app', { name });
}

export async function toggleDarkMode(): Promise<AutomationResult> {
  return invoke<AutomationResult>('toggle_dark_mode');
}

export async function captureScreen(outputPath: string): Promise<string> {
  return invoke<string>('capture_screen', { outputPath });
}

export interface ScreenData {
  filePath: string;
  base64: string;
  width: number;
  height: number;
}

export async function captureScreenData(): Promise<ScreenData> {
  return invoke<ScreenData>('capture_screen_data');
}

export interface VoiceProfile {
  name: string;
  locale: string;
  description: string;
}

export interface VoiceOutputResult {
  success: boolean;
  message: string;
  voiceUsed: string;
}

export async function speakText(text: string, voice?: string, rate?: number): Promise<VoiceOutputResult> {
  return invoke<VoiceOutputResult>('speak_text', { text, voice: voice ?? null, rate: rate ?? null });
}

export async function stopSpeaking(): Promise<void> {
  return invoke<void>('stop_speaking');
}

export async function playSystemEarcon(kind: 'wake' | 'success' | 'error' | 'processing'): Promise<void> {
  return invoke<void>('play_system_earcon', { kind });
}

export async function listSystemVoices(): Promise<VoiceProfile[]> {
  return invoke<VoiceProfile[]>('list_system_voices');
}

export interface TranscriptionResult {
  success: boolean;
  text: string;
  language: string;
  durationSeconds: number;
  confidence: number;
  error?: string;
}

export interface GlobalHotkeyStatus {
  hotkey: string;
  isRegistered: boolean;
  description: string;
}

export async function transcribeAudioFile(filePath: string, model?: string): Promise<TranscriptionResult> {
  return invoke<TranscriptionResult>('transcribe_audio_file', { filePath, model: model ?? null });
}

export async function transcribeAudioBuffer(audioBase64: string, format?: string): Promise<TranscriptionResult> {
  return invoke<TranscriptionResult>('transcribe_audio_buffer', { audioBase64, format: format ?? null });
}

export async function getRegisteredHotkeys(): Promise<GlobalHotkeyStatus[]> {
  return invoke<GlobalHotkeyStatus[]>('get_registered_hotkeys');
}

export async function registerGlobalHotkey(hotkey: string): Promise<boolean> {
  return invoke<boolean>('register_global_hotkey', { hotkey });
}

export async function unregisterGlobalHotkey(hotkey: string): Promise<boolean> {
  return invoke<boolean>('unregister_global_hotkey', { hotkey });
}

export interface SpeechEngineStatus {
  whisperBinPath?: string | null;
  ffmpegPath?: string | null;
  hasPythonWhisper: boolean;
  isOfflineCapable: boolean;
  defaultEngine: string;
  supportedModels: string[];
}

export interface WakeWordSpotResult {
  detected: boolean;
  keyword: string;
  command: string;
  confidence: number;
  engineUsed: string;
  transcription: string;
}

export interface NotchWindowState {
  isVisible: boolean;
  width: number;
  height: number;
  isExpanded: boolean;
}

export async function getSpeechEngineStatus(): Promise<SpeechEngineStatus> {
  return invoke<SpeechEngineStatus>('get_speech_engine_status');
}

export async function spotWakeWordInAudio(
  audioBase64: string,
  format?: string
): Promise<WakeWordSpotResult> {
  return invoke<WakeWordSpotResult>('spot_wake_word_in_audio', {
    audioBase64,
    format: format ?? null,
  });
}

export async function showNotchWindow(): Promise<boolean> {
  return invoke<boolean>('show_notch_window');
}

export async function hideNotchWindow(): Promise<boolean> {
  return invoke<boolean>('hide_notch_window');
}

export async function toggleNotchWindow(): Promise<boolean> {
  return invoke<boolean>('toggle_notch_window');
}

export async function resizeNotchWindow(width: number, height: number): Promise<boolean> {
  return invoke<boolean>('resize_notch_window', { width, height });
}

export async function getNotchWindowState(): Promise<NotchWindowState> {
  return invoke<NotchWindowState>('get_notch_window_state');
}

export async function showMainWindow(): Promise<boolean> {
  try {
    return await invoke<boolean>('show_main_window');
  } catch (err) {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const win = await WebviewWindow.getByLabel('main');
        if (win) {
          await win.unminimize();
          await win.center();
          await win.show();
          await win.setFocus();
          return true;
        }
      } catch {}
    }
    return false;
  }
}

export async function toggleMainWindow(): Promise<boolean> {
  try {
    return await invoke<boolean>('toggle_main_window');
  } catch {
    return false;
  }
}

