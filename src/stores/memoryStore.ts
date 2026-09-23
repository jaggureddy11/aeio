import { create } from 'zustand';

export interface Memory {
  id: string;
  content: string;
  category: 'fact' | 'preference' | 'project' | 'person';
  createdAt: number;
  updatedAt: number;
}

export interface MemoryState {
  memories: Memory[];
  isLoading: boolean;
  setMemories: (memories: Memory[]) => void;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  memories: [],
  isLoading: false,
  setMemories: (memories) => set({ memories }),
}));
