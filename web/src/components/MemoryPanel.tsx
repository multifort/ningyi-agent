import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "./AuthProvider";

interface Memory {
  id: string;
  key: string;
  content: string;
  source: "auto" | "manual";
  createdAt: string;
  updatedAt: string;
}

export function MemoryPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetchApi("/memory", {}, token)
      .then((d) => setMemories(d.memories))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newKey.trim() || !newContent.trim()) return;
    try {
      await fetchApi("/memory", { method: "POST", body: JSON.stringify({ key: newKey, content: newContent }) }, token);
      setNewKey(""); setNewContent("");
      load();
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetchApi(`/memory/${id}`, { method: "DELETE" }, token);
      setMemories((m) => m.filter((x) => x.id !== id));
    } catch { /* ignore */ }
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await fetchApi(`/memory/${id}`, { method: "PUT", body: JSON.stringify({ content: editContent }) }, token);
      setEditingId(null);
      load();
    } catch { /* ignore */ }
  };

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="side-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>🧠 记忆</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <p className="panel-hint">助手会记住这些信息，并在 Agent 模式对话中参考。</p>

        <div className="memory-add">
          <input className="settings-input" placeholder="标识（如 编程语言偏好）" value={newKey}
            onChange={(e) => setNewKey(e.target.value)} maxLength={100} />
          <textarea className="settings-textarea" placeholder="内容" value={newContent}
            onChange={(e) => setNewContent(e.target.value)} rows={2} maxLength={4000} />
          <button className="btn-settings-primary" onClick={handleAdd}
            disabled={!newKey.trim() || !newContent.trim()}>添加记忆</button>
        </div>

        <div className="memory-list">
          {loading ? (
            <div className="panel-empty">加载中…</div>
          ) : memories.length === 0 ? (
            <div className="panel-empty">还没有任何记忆</div>
          ) : (
            memories.map((m) => (
              <div key={m.id} className="memory-item">
                <div className="memory-item-head">
                  <span className="memory-key">{m.key}</span>
                  <span className={`memory-source memory-source-${m.source}`}>
                    {m.source === "auto" ? "自动" : "手动"}
                  </span>
                  <div className="memory-actions">
                    {editingId === m.id ? (
                      <button className="memory-btn" onClick={() => handleSaveEdit(m.id)}>保存</button>
                    ) : (
                      <button className="memory-btn" onClick={() => { setEditingId(m.id); setEditContent(m.content); }}>编辑</button>
                    )}
                    <button className="memory-btn memory-btn-danger" onClick={() => handleDelete(m.id)}>删除</button>
                  </div>
                </div>
                {editingId === m.id ? (
                  <textarea className="settings-textarea" value={editContent}
                    onChange={(e) => setEditContent(e.target.value)} rows={2} maxLength={4000} />
                ) : (
                  <div className="memory-content">{m.content}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
