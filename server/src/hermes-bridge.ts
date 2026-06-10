/**
 * HermesBridge — subprocess-based bridge to Hermes Agent CLI.
 *
 * Two modes:
 *   - quiet (-Q):  fast, final text only. session_id on stderr.
 *   - verbose:     captures tool-call activity for the Agent UI.
 *
 * Gateway (HTTP) mode is a future enhancement; Hermes ships a CLI today.
 */

import { spawn } from "node:child_process";

export interface ToolEvent {
  /** Normalized tool name, e.g. "bash", "web_search", "file". */
  name: string;
  /** Human-readable detail (command, query, path). */
  detail: string;
  /** Duration in ms, if Hermes reported it. */
  durationMs?: number;
}

export interface HermesResponse {
  sessionId: string;
  text: string;
  toolEvents: ToolEvent[];
  stderr?: string;
}

export interface HermesBridgeOptions {
  /** Path to the hermes CLI binary. Defaults to "hermes" (or HERMES_CLI_PATH). */
  cliPath?: string;
  /** Max LLM turns per call. Defaults to 10. */
  maxTurns?: number;
  /** Timeout in milliseconds. Defaults to 120_000 (2 min). */
  timeoutMs?: number;
  /** Working directory for Hermes (repo root). */
  cwd?: string;
  /** Capture tool-call activity (runs verbose). Defaults to true. */
  verbose?: boolean;
  /** Skills to preload for this call (hermes -s). */
  skills?: string[];
}

const DEFAULT_OPTIONS: Required<HermesBridgeOptions> = {
  cliPath: process.env.HERMES_CLI_PATH ?? "hermes",
  maxTurns: 10,
  timeoutMs: 120_000,
  cwd: process.cwd(),
  verbose: true,
  skills: [],
};

// ── Health check ────────────────────────────────

let _healthCache: { ok: boolean; checkedAt: number } | null = null;
const HEALTH_TTL_MS = 30_000;

export async function hermesHealth(): Promise<boolean> {
  const now = Date.now();
  if (_healthCache && now - _healthCache.checkedAt < HEALTH_TTL_MS) {
    return _healthCache.ok;
  }
  try {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(DEFAULT_OPTIONS.cliPath, ["--version"], { timeout: 5000 });
      child.on("close", (code) => resolve(code === 0));
      child.on("error", () => resolve(false));
    });
    _healthCache = { ok, checkedAt: now };
    return ok;
  } catch {
    _healthCache = { ok: false, checkedAt: now };
    return false;
  }
}

function invalidateHealth() {
  _healthCache = null;
}

// ── Output parsing ──────────────────────────────

// Strip ANSI escape sequences and normalize carriage returns.
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "").replace(/\r/g, "\n");
}

const SESSION_RE = /(?:session_id:\s*|--resume\s+|Session:\s+)(\S+)/;

// Map a tool marker emoji to a normalized tool name.
function toolNameFromMarker(line: string): string {
  if (line.includes("💻")) return "bash";
  if (line.includes("🌐") || line.includes("🔍")) return "web_search";
  if (line.includes("📄") || line.includes("📁") || line.includes("📝")) return "file";
  if (line.includes("🧠") || line.includes("💭")) return "thinking";
  return "tool";
}

/**
 * Parse Hermes -Q (quiet) output.
 *   stdout → response text (+ ⚠ warning prefixes)
 *   stderr → session_id: XXXX
 */
export function parseQuietOutput(stdout: string, stderr: string): HermesResponse {
  const sessionId =
    (SESSION_RE.exec(stderr) ?? SESSION_RE.exec(stdout))?.[1] ?? "";
  const SKIP = ["  ⚠", "↻ Resumed", "session_id:"];
  const text = stdout
    .split("\n")
    .filter((l) => !SKIP.some((p) => l.startsWith(p)))
    .join("\n")
    .trim();
  return { sessionId, text, toolEvents: [] };
}

/**
 * Parse Hermes verbose output.
 * Markers (after ANSI strip):
 *   ┊ 💻 $ <cmd>  <dur>s       → tool execution
 *   ╭─ ⚕ Hermes ─╮ ... ╰─╯    → answer box (content = final text)
 *   hermes --resume <ID>       → session id
 */
export function parseVerboseOutput(stdout: string, stderr: string): HermesResponse {
  const clean = stripAnsi(stdout);
  const lines = clean.split("\n");

  const sessionId =
    (SESSION_RE.exec(clean) ?? SESSION_RE.exec(stripAnsi(stderr)))?.[1] ?? "";

  const toolEvents: ToolEvent[] = [];
  const answerChunks: string[] = [];
  let inBox = false;

  const BOX_CHARS = new Set("─╭╮╰╯│ ");
  const isBoxBorder = (s: string) => s.length > 0 && [...s].every((c) => BOX_CHARS.has(c));

  for (const rawLine of lines) {
    const line = rawLine.replace(/\n/g, "");
    const s = line.trim();
    if (!s) {
      if (inBox) answerChunks.push("");
      continue;
    }

    // Tool activity marker
    if (s.startsWith("┊")) {
      // Skip "preparing terminal…" placeholder
      if (s.includes("preparing")) continue;
      const name = toolNameFromMarker(s);
      // Extract duration suffix like "  1.5s"
      const durMatch = /\s([\d.]+)s\s*$/.exec(s);
      const durationMs = durMatch ? Math.round(parseFloat(durMatch[1]) * 1000) : undefined;
      // Detail: strip leading "┊ <emoji> " and any "$ " prompt, and trailing duration
      let detail = s.replace(/^┊\s*\S+\s*/, "").replace(/\s[\d.]+s\s*$/, "").trim();
      detail = detail.replace(/^\$\s*/, "").trim();
      if (detail) toolEvents.push({ name, detail, durationMs });
      continue;
    }

    // Answer box boundaries
    if (s.includes("⚕ Hermes")) { inBox = true; continue; }
    if (inBox && isBoxBorder(s)) { inBox = false; continue; }
    if (isBoxBorder(s)) continue;

    // Footer lines — stop capturing
    if (
      s.startsWith("Resume this session") ||
      s.startsWith("hermes --resume") ||
      s.startsWith("Session:") ||
      s.startsWith("Duration:") ||
      s.startsWith("Messages:") ||
      s.startsWith("Query:") ||
      s.startsWith("Initializing") ||
      s.startsWith("  ⚠")
    ) {
      inBox = false;
      continue;
    }

    if (inBox) answerChunks.push(line.replace(/^\s{0,4}/, ""));
  }

  const text = answerChunks.join("\n").trim();
  return { sessionId, text, toolEvents };
}

// ── Core send ───────────────────────────────────

export async function hermesSend(
  prompt: string,
  sessionId?: string,
  options: HermesBridgeOptions = {},
): Promise<HermesResponse> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const args = ["chat", "-q", prompt, "--max-turns", String(opts.maxTurns)];
  if (!opts.verbose) args.push("-Q");
  if (sessionId) args.push("--resume", sessionId);
  for (const skill of opts.skills) args.push("-s", skill);

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(opts.cliPath, args, {
      cwd: opts.cwd,
      env: { ...process.env },
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Hermes timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);

    child.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      const parsed = opts.verbose
        ? parseVerboseOutput(stdout, stderr)
        : parseQuietOutput(stdout, stderr);

      if (code !== 0 && !parsed.text) {
        invalidateHealth();
        reject(new Error(`Hermes exited with code ${code}. stderr: ${stderr.slice(0, 500)}`));
        return;
      }
      if (!parsed.sessionId) {
        console.warn("[HermesBridge] session_id not found; using generated ID");
        parsed.sessionId = `fallback-${Date.now()}`;
      }
      resolve({ ...parsed, stderr });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      invalidateHealth();
      reject(new Error(`Failed to spawn Hermes: ${err.message}`));
    });
  });
}

// ── Streaming generator ─────────────────────────

/**
 * Send a prompt and yield SSE-shaped events.
 *
 * Hermes CLI buffers output, so we run to completion, then replay:
 *   thinking → (tool_start, tool_end)* → token* → done
 */
export async function* hermesStream(
  prompt: string,
  sessionId?: string,
  options: HermesBridgeOptions = {},
): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  yield { event: "thinking", data: { status: "hermes_working" } };

  let response: HermesResponse;
  try {
    response = await hermesSend(prompt, sessionId, options);
  } catch (err) {
    yield {
      event: "error",
      data: { message: err instanceof Error ? err.message : "Hermes error" },
    };
    return;
  }

  // Replay tool calls (already completed; emit start+end together)
  for (let i = 0; i < response.toolEvents.length; i++) {
    const t = response.toolEvents[i];
    yield {
      event: "tool_start",
      data: { stepId: i, toolName: t.name, input: t.detail },
    };
    yield {
      event: "tool_end",
      data: { stepId: i, output: "", durationMs: t.durationMs ?? null },
    };
  }

  const text = response.text;
  if (!text) {
    yield {
      event: "done",
      data: { sessionId: response.sessionId, finished: true, toolEvents: response.toolEvents },
    };
    return;
  }

  // Simulate typing with ~4-char chunks. A real (small) delay between chunks
  // is required so they flush as separate network packets — otherwise TCP
  // coalesces them and the client receives everything in one read (which makes
  // the response look non-streaming, especially on React Native's fetch).
  const CHUNK = 4;
  for (let i = 0; i < text.length; i += CHUNK) {
    yield { event: "token", data: { content: text.slice(i, i + CHUNK) } };
    await new Promise((r) => setTimeout(r, 18));
  }

  yield {
    event: "done",
    data: { sessionId: response.sessionId, finished: true, toolEvents: response.toolEvents },
  };
}
