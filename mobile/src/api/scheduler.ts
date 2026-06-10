import { api } from "./client";

export interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

export interface TaskRun {
  id: string;
  conversationId: string | null;
  status: "running" | "done" | "error";
  startedAt: string;
  finishedAt: string | null;
}

export async function listTasks(): Promise<ScheduledTask[]> {
  const res = await api.get<{ tasks: ScheduledTask[] }>("/scheduler/tasks");
  return res.tasks;
}

export async function createTask(data: {
  name: string;
  schedule: string;
  prompt: string;
}): Promise<ScheduledTask> {
  const res = await api.post<{ task: ScheduledTask }>("/scheduler/tasks", data);
  return res.task;
}

export async function updateTask(
  id: string,
  data: Partial<{ name: string; schedule: string; prompt: string; enabled: boolean }>,
): Promise<ScheduledTask> {
  const res = await api.put<{ task: ScheduledTask }>(`/scheduler/tasks/${id}`, data);
  return res.task;
}

export async function deleteTask(id: string): Promise<void> {
  return api.delete(`/scheduler/tasks/${id}`);
}

export async function getTaskRuns(id: string): Promise<TaskRun[]> {
  const res = await api.get<{ runs: TaskRun[] }>(`/scheduler/tasks/${id}/runs`);
  return res.runs;
}
