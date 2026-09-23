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
