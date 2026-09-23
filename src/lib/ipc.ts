import { invoke } from '@tauri-apps/api/core';

export interface MemoryRecord {
  id: string;
  content: string;
  category: 'fact' | 'preference' | 'project' | 'person';
  createdAt: number;
  updatedAt: number;
}

export async function addMemory(content: string, category: string): Promise<string> {
  return invoke<string>('add_memory', { content, category });
}

export async function listMemories(): Promise<MemoryRecord[]> {
  return invoke<MemoryRecord[]>('list_memories');
}

export async function updateMemory(id: string, content: string, category: string): Promise<boolean> {
  return invoke<boolean>('update_memory', { id, content, category });
}

export async function deleteMemory(id: string): Promise<boolean> {
  return invoke<boolean>('delete_memory', { id });
}

export async function searchMemories(query: string, limit: number = 5): Promise<MemoryRecord[]> {
  return invoke<MemoryRecord[]>('search_memories', { query, limit });
}
