import { api } from "./client";

export interface Conversation {
  id: string;
  title: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  createdAt?: string;
}

export interface ToolCall {
  stepId: number;
  toolName: string;
  input: string;
  output?: string;
  durationMs?: number | null;
  status: "running" | "done" | "error";
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await api.get<{ conversations: Conversation[] }>("/api/conversations");
  return res.conversations ?? [];
}

export async function createConversation(): Promise<Conversation> {
  const res = await api.post<{ conversation: Conversation }>("/api/conversations", {
    title: "新对话",
  });
  return res.conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  return api.delete(`/api/conversations/${id}`);
}

export async function renameConversation(id: string, title: string): Promise<void> {
  return api.put(`/api/conversations/${id}`, { title });
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const res = await api.get<{ messages: Message[] }>(
    `/api/conversations/${conversationId}/messages`,
  );
  return res.messages ?? [];
}

export interface SearchResult {
  conversationId: string;
  title: string;
  snippet: string | null;
  updatedAt: string;
}

export async function searchConversations(q: string): Promise<SearchResult[]> {
  const res = await api.get<{ results: SearchResult[] }>(
    `/api/conversations/search?q=${encodeURIComponent(q)}`,
  );
  return res.results ?? [];
}

export interface ShareInfo {
  token: string;
  url: string; // relative path like /share/<token>
  expiresAt: string;
}

export async function shareConversation(id: string): Promise<ShareInfo> {
  return api.post<ShareInfo>(`/api/conversations/${id}/share`, {});
}
