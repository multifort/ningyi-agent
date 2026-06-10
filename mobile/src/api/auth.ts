import { api, saveToken, clearToken, getToken } from "./client";

export interface User {
  id: number;
  username: string;
  displayName?: string;
  avatar?: string;
  systemPrompt?: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/api/auth/login", { username, password });
  await saveToken(res.token);
  return res;
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/api/auth/register", { username, password });
  await saveToken(res.token);
  return res;
}

export async function getMe(): Promise<User> {
  return api.get<User>("/api/auth/me");
}

export async function updateProfile(data: Partial<{
  displayName: string;
  avatar: string;
  systemPrompt: string;
  apiKey: string;
  newPassword: string;
  currentPassword: string;
}>): Promise<User> {
  return api.put<User>("/api/auth/profile", data);
}

export async function logout(): Promise<void> {
  await clearToken();
}

export async function checkHealth(baseURL: string): Promise<boolean> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${baseURL}/api/health`, { headers });
    return res.ok;
  } catch {
    return false;
  }
}
