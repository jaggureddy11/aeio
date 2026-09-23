import { invoke } from '@tauri-apps/api/core';

export type MemoryCategory = 'fact' | 'preference' | 'project' | 'person';

export interface MemoryRecord {
  id: string;
  content: string;
  category: MemoryCategory;
  embedding?: number[] | null;
  created_at: number;
  updated_at: number;
}

export interface MemorySearchResult {
  memory: MemoryRecord;
  score: number;
}

export async function addMemory(
  content: string,
  category: MemoryCategory
): Promise<MemoryRecord> {
  return invoke<MemoryRecord>('add_memory', { content, category });
}

export async function listMemories(
  category?: MemoryCategory
): Promise<MemoryRecord[]> {
  return invoke<MemoryRecord[]>('list_memories', { category });
}

export async function updateMemory(
  id: string,
  content: string,
  category: MemoryCategory
): Promise<MemoryRecord> {
  return invoke<MemoryRecord>('update_memory', { id, content, category });
}

export async function deleteMemory(id: string): Promise<boolean> {
  return invoke<boolean>('delete_memory', { id });
}

export async function searchMemories(
  query: string,
  limit: number = 5
): Promise<MemorySearchResult[]> {
  return invoke<MemorySearchResult[]>('search_memories', { query, limit });
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

// Chat Persistence & Memory Export (Tier 0 & Non-Negotiable Constraint)
export interface SavedChatMessage {
  id: string;
  role: string;
  content: string;
  recalled_memories_json?: string | null;
  proposed_memories_json?: string | null;
  tool_executions_json?: string | null;
  timestamp: number;
}

export async function saveChatMessage(message: SavedChatMessage): Promise<void> {
  return invoke<void>('save_chat_message', { message });
}

export async function loadChatMessages(limit?: number): Promise<SavedChatMessage[]> {
  return invoke<SavedChatMessage[]>('load_chat_messages', { limit });
}

export async function clearChatHistory(): Promise<void> {
  return invoke<void>('clear_chat_history');
}

export async function exportMemories(format: 'json' | 'markdown'): Promise<string> {
  return invoke<string>('export_memories', { format });
}
