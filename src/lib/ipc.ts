import { invoke } from '@tauri-apps/api/core';

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

