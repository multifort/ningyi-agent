import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "./AuthProvider";

interface Task {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

interface Run {
  id: string;
  conversationId: string | null;
  status: string;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

const PRESETS = [
  { label: "每分钟（测试）", value: "* * * * *" },
  { label: "每小时", value: "0 * * * *" },
  { label: "每天 9:00", value: "0 9 * * *" },
  { label: "工作日 9:00", value: "0 9 * * 1-5" },
  { label: "每周一 8:00", value: "0 8 * * 1" },
];

export function SchedulerPanel({
  token,
  onClose,
  onOpenConversation,
}: {
  token: string;
  onClose: () => void;
  onOpenConversation?: (id: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 9 * * *");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [error, setError] = useState("");
  const [runsFor, setRunsFor] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    fetchApi("/scheduler/tasks", {}, token)
      .then((d) => setTasks(d.tasks))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setError("");
    if (!name.trim() || !taskPrompt.trim()) { setError("请填写名称和内容"); return; }
    try {
      await fetchApi("/scheduler/tasks", {
        method: "POST",
        body: JSON.stringify({ name, schedule, prompt: taskPrompt }),
      }, token);
      setName(""); setTaskPrompt("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    }
  };

  const toggle = async (t: Task) => {
    try {
      await fetchApi(`/scheduler/tasks/${t.id}`, { method: "PUT", body: JSON.stringify({ enabled: !t.enabled }) }, token);
      load();
    } catch { /* ignore */ }
  };

  const remove = async (id: string) => {
    try {
      await fetchApi(`/scheduler/tasks/${id}`, { method: "DELETE" }, token);
      setTasks((ts) => ts.filter((t) => t.id !== id));
    } catch { /* ignore */ }
  };

  const showRuns = async (id: string) => {
    if (runsFor === id) { setRunsFor(null); return; }
    try {
      const d = await fetchApi(`/scheduler/tasks/${id}/runs`, {}, token);
      setRuns(d.runs);
      setRunsFor(id);
    } catch { /* ignore */ }
  };

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="side-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>⏰ 定时任务</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <p className="panel-hint">让 Agent 按计划自动执行任务，结果保存为新对话。</p>

        <div className="memory-add">
          <input className="settings-input" placeholder="任务名称" value={name}
            onChange={(e) => setName(e.target.value)} maxLength={100} />
          <select className="settings-input" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
            {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}（{p.value}）</option>)}
          </select>
          <input className="settings-input" value={schedule} onChange={(e) => setSchedule(e.target.value)}
            placeholder="cron 表达式（5 字段）" />
          <textarea className="settings-textarea" placeholder="任务内容（发给 Agent 的提示词）" value={taskPrompt}
            onChange={(e) => setTaskPrompt(e.target.value)} rows={2} maxLength={8000} />
          {error && <div className="settings-error">{error}</div>}
          <button className="btn-settings-primary" onClick={handleCreate}>创建任务</button>
        </div>

        <div className="memory-list">
          {loading ? (
            <div className="panel-empty">加载中…</div>
          ) : tasks.length === 0 ? (
            <div className="panel-empty">还没有定时任务</div>
          ) : (
            tasks.map((t) => (
              <div key={t.id} className="memory-item">
                <div className="memory-item-head">
                  <span className="memory-key">{t.name}</span>
                  <span className={`memory-source ${t.enabled ? "memory-source-manual" : ""}`}>
                    {t.enabled ? "启用" : "停用"}
                  </span>
                  <div className="memory-actions">
                    <button className="memory-btn" onClick={() => toggle(t)}>{t.enabled ? "停用" : "启用"}</button>
                    <button className="memory-btn" onClick={() => showRuns(t.id)}>历史</button>
                    <button className="memory-btn memory-btn-danger" onClick={() => remove(t.id)}>删除</button>
                  </div>
                </div>
                <div className="sched-meta">
                  <code>{t.schedule}</code>
                  {t.nextRunAt && <span> · 下次：{t.nextRunAt}</span>}
                </div>
                <div className="memory-content">{t.prompt}</div>
                {runsFor === t.id && (
                  <div className="sched-runs">
                    {runs.length === 0 ? (
                      <div className="sched-run-empty">暂无执行记录</div>
                    ) : (
                      runs.map((r) => (
                        <div key={r.id} className="sched-run" onClick={() => r.conversationId && onOpenConversation?.(r.conversationId)}>
                          <span className={`sched-run-status sched-run-${r.status}`}>
                            {r.status === "done" ? "✓" : r.status === "error" ? "✗" : "⏳"}
                          </span>
                          <span>{r.startedAt}</span>
                          {r.error && <span className="sched-run-err">{r.error}</span>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
