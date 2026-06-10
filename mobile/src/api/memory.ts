import { api } from "./client";

export interface Memory {
  id: string;
  key: string;
  content: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export async function listMemories(): Promise<Memory[]> {
  const res = await api.get<{ memories: Memory[] }>("/memory");
  return res.memories;
}

export async function addMemory(key: string, content: string): Promise<{ id: string }> {
  return api.post("/memory", { key, content });
}

export async function updateMemory(id: string, data: { key?: string; content?: string }): Promise<void> {
  return api.put(`/memory/${id}`, data);
}

export async function deleteMemory(id: string): Promise<void> {
  return api.delete(`/memory/${id}`);
}
