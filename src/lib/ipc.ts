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
