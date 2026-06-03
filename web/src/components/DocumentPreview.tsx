import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { fetchApi, useAuth } from "./AuthProvider";

interface PreviewData {
  path: string;
  name: string;
  ext: string;
  type: "markdown" | "code" | "text";
  size: number;
  truncated: boolean;
  content: string;
}

/**
 * Modal that previews a local file by path. Markdown is rendered; code/text
 * shown in a monospaced block. Fetches from GET /api/files/preview.
 */
export function DocumentPreview({
  path,
  onClose,
}: {
  path: string;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchApi(`/files/preview?path=${encodeURIComponent(path)}`, {}, token)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "无法打开文件"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, token]);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleCopy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const fmtSize = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

  return (
    <div className="doc-preview-overlay" onClick={onClose}>
      <div className="doc-preview-panel" onClick={(e) => e.stopPropagation()}>
        <div className="doc-preview-header">
          <div className="doc-preview-title">
            <span className="doc-preview-icon">📄</span>
            <span className="doc-preview-name">{data?.name ?? "文档预览"}</span>
            {data && <span className="doc-preview-meta">{fmtSize(data.size)}{data.truncated ? " · 已截断" : ""}</span>}
          </div>
          <div className="doc-preview-actions">
            {data && (
              <button className="doc-preview-btn" onClick={handleCopy}>
                {copied ? "✓ 已复制" : "📋 复制"}
              </button>
            )}
            <button className="doc-preview-btn doc-preview-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {data && <div className="doc-preview-path" title={data.path}>{data.path}</div>}

        <div className="doc-preview-body">
          {loading && <p className="doc-preview-state">加载中…</p>}
          {error && <p className="doc-preview-state doc-preview-error">⚠️ {error}</p>}
          {data && !loading && (
            data.type === "markdown" ? (
              <div className="doc-preview-markdown markdown-body">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {data.content}
                </ReactMarkdown>
              </div>
            ) : (
              <pre className="doc-preview-code"><code>{data.content}</code></pre>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Extract an absolute file path from a tool-call input like
 * "write /Users/.../README.md" or "read /path/to/file". Returns null if none.
 */
export function extractFilePath(input: string): string | null {
  if (!input) return null;
  // Match an absolute POSIX path with a file extension.
  const m = /(\/[^\s'"]+\.[A-Za-z0-9]+)/.exec(input);
  return m ? m[1] : null;
}
