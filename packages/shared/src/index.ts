// Shared types between server, web, and mobile

export interface ToolCall {
  stepId: number;
  toolName: string;
  input: string;
  output?: string;
  durationMs?: number | null;
  status: "running" | "done" | "error";
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  createdAt?: string;
}

export interface Conversation {
  id: string;
  title: string;
  model?: string;
  createdAt: string | number;
  updatedAt: string | number;
}

export interface User {
  id: number;
  username: string;
  displayName?: string;
  avatar?: string;
  systemPrompt?: string;
}

// SSE event shapes from /api/chat
export type SSEEvent =
  | { type: "token"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool_start"; stepId: number; toolName: string; input: string }
  | { type: "tool_end"; stepId: number; output: string; durationMs: number | null }
  | { type: "citations"; citations: string[] }
  | { type: "done"; conversationId: string; messageId: string }
  | { type: "error"; message: string };

export interface ApiError {
  error: string;
  status: number;
}

// API request/response shapes
export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ChatRequest {
  conversationId?: string;
  messages: Array<{ role: string; content: string }>;
  mode?: "chat" | "agent";
  search?: boolean;
}
