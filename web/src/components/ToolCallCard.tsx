import { useState } from "react";
import type { ToolCall } from "../types";

const TOOL_ICONS: Record<string, string> = {
  bash: "💻",
  web_search: "🌐",
  file: "📄",
  thinking: "🧠",
  tool: "🔧",
};

const TOOL_LABELS: Record<string, string> = {
  bash: "终端命令",
  web_search: "联网搜索",
  file: "文件操作",
  thinking: "推理",
  tool: "工具调用",
};

function fmtDuration(ms?: number | null): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[tool.toolName] ?? TOOL_ICONS.tool;
  const label = TOOL_LABELS[tool.toolName] ?? tool.toolName;

  return (
    <div className={`tool-call-card tool-call-${tool.status}`}>
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-call-icon">{icon}</span>
        <span className="tool-call-label">{label}</span>
        <span className="tool-call-input" title={tool.input}>
          {tool.input.length > 60 ? tool.input.slice(0, 60) + "…" : tool.input}
        </span>
        <span className="tool-call-status">
          {tool.status === "running" && <span className="tool-call-spinner">⏳</span>}
          {tool.status === "done" && (
            <span className="tool-call-done">✓ {fmtDuration(tool.durationMs)}</span>
          )}
          {tool.status === "error" && <span className="tool-call-err">✗ 失败</span>}
        </span>
        <span className="tool-call-chevron">{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && (
        <div className="tool-call-body">
          <div className="tool-call-section">
            <div className="tool-call-section-title">输入</div>
            <pre className="tool-call-pre">{tool.input || "（无）"}</pre>
          </div>
          {tool.output != null && tool.output !== "" && (
            <div className="tool-call-section">
              <div className="tool-call-section-title">输出</div>
              <pre className="tool-call-pre">{tool.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolCallList({ tools }: { tools: ToolCall[] }) {
  if (!tools || tools.length === 0) return null;
  return (
    <div className="tool-call-list">
      {tools.map((t) => (
        <ToolCallCard key={t.stepId} tool={t} />
      ))}
    </div>
  );
}
