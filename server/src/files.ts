/**
 * File preview — read a file's content for in-app document viewing.
 *
 * Agent-mode tool calls (read/write/edit) operate on the local filesystem.
 * This lets the UI render those files (especially Markdown) instead of just
 * showing a path. Read-only, auth-gated, and confined to allowed roots.
 */

import { Router } from "express";
import { resolve, extname, basename } from "node:path";
import { realpathSync, statSync, readFileSync } from "node:fs";
import { authMiddleware, type AuthRequest } from "./middleware/auth.js";

const router = Router();
router.use(authMiddleware);

// Allowed roots: configurable; default to the server's working dir and its
// parent workspace (covers sibling projects the agent may create files in).
const ALLOWED_ROOTS = (
  process.env.FILE_PREVIEW_ROOTS ??
  [process.cwd(), resolve(process.cwd(), ".."), resolve(process.cwd(), "..", "..")].join(":")
)
  .split(":")
  .map((p) => {
    try { return realpathSync(resolve(p)); } catch { return resolve(p); }
  });

const MAX_BYTES = 1024 * 1024; // 1 MB

const MARKDOWN_EXT = new Set([".md", ".markdown", ".mdx"]);
const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".py", ".java", ".go", ".rs",
  ".c", ".cpp", ".h", ".hpp", ".css", ".scss", ".html", ".xml", ".yaml",
  ".yml", ".toml", ".sh", ".sql", ".kt", ".swift", ".rb", ".php",
]);

function classify(ext: string): "markdown" | "code" | "text" {
  const e = ext.toLowerCase();
  if (MARKDOWN_EXT.has(e)) return "markdown";
  if (CODE_EXT.has(e)) return "code";
  return "text";
}

export function isWithinAllowedRoot(realPath: string, roots: string[] = ALLOWED_ROOTS): boolean {
  return roots.some(
    (root) => realPath === root || realPath.startsWith(root + "/"),
  );
}

export type PathCheck =
  | { ok: true; realPath: string }
  | { ok: false; status: number; message: string };

/** Resolve + symlink-resolve a requested path and confirm it's inside a root. */
export function checkPreviewPath(raw: string, roots: string[] = ALLOWED_ROOTS): PathCheck {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, status: 400, message: "缺少 path 参数" };
  }
  let realPath: string;
  try {
    realPath = realpathSync(resolve(raw));
  } catch {
    return { ok: false, status: 404, message: "文件不存在" };
  }
  if (!isWithinAllowedRoot(realPath, roots)) {
    return { ok: false, status: 403, message: "无权访问该路径" };
  }
  return { ok: true, realPath };
}

// Heuristic binary check: NUL byte in the first chunk.
function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

// GET /api/files/preview?path=<absolute path>
router.get("/files/preview", (req: AuthRequest, res) => {
  const check = checkPreviewPath(req.query.path as string);
  if (!check.ok) {
    res.status(check.status).json({ message: check.message });
    return;
  }
  const realPath = check.realPath;

  let st;
  try {
    st = statSync(realPath);
  } catch {
    res.status(404).json({ message: "文件不存在" });
    return;
  }
  if (!st.isFile()) {
    res.status(400).json({ message: "不是一个文件" });
    return;
  }

  const ext = extname(realPath);
  const buf = readFileSync(realPath);

  if (looksBinary(buf)) {
    res.status(415).json({ message: "二进制文件无法预览", name: basename(realPath), size: st.size });
    return;
  }

  const truncated = buf.length > MAX_BYTES;
  const content = buf.subarray(0, MAX_BYTES).toString("utf-8");

  res.json({
    path: realPath,
    name: basename(realPath),
    ext,
    type: classify(ext),
    size: st.size,
    truncated,
    content,
  });
});

export default router;
