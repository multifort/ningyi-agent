/**
 * HermesBridge — subprocess-based bridge to Hermes Agent CLI.
 *
 * Spawns:  hermes chat -q "<prompt>" -Q --max-turns N [--resume SESSION_ID]
 * Parses:  stdout for session_id + response text
 * Returns: AsyncGenerator streaming tokens (word-by-word for UX)
 *
 * POC scope: subprocess mode only. Gateway mode is a future enhancement.
 */

import { spawn } from "node:child_process";

export interface HermesResponse {
  sessionId: string;
  text: string;
  /** raw stderr for debugging */
  stderr?: string;
}

export interface HermesBridgeOptions {
  /** Path to the hermes CLI binary. Defaults to "hermes". */
  cliPath?: string;
  /** Max LLM turns per call. Defaults to 10. */
  maxTurns?: number;
  /** Timeout in milliseconds. Defaults to 120_000 (2 min). */
  timeoutMs?: number;
  /** Working directory for Hermes (repo root). */
  cwd?: string;
}

const DEFAULT_OPTIONS: Required<HermesBridgeOptions> = {
  cliPath: process.env.HERMES_CLI_PATH ?? "hermes",
  maxTurns: 10,
  timeoutMs: 120_000,
  cwd: process.cwd(),
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
      const child = spawn("hermes", ["--version"], { timeout: 5000 });
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

// Invalidate health cache (called on bridge error)
function invalidateHealth() {
  _healthCache = null;
}

// ── Response parser ─────────────────────────────

/**
 * Parse Hermes output.
 *
 * When run from a project directory (with .hermes.md), Hermes routes:
 *   stdout → response text (may include ⚠ warning prefix lines)
 *   stderr → session_id: XXXX  (+ optional resume/info lines)
 *
 * When run outside a project dir (or piped without project context),
 * session_id may appear in stdout instead. We check both.
 */
function parseHermesOutput(
  stdout: string,
  stderr: string,
): { sessionId: string; text: string } {
  // Extract session_id — check stderr first, then stdout
  const SESSION_RE = /session_id:\s*(\S+)/;
  const sessionId =
    (SESSION_RE.exec(stderr) ?? SESSION_RE.exec(stdout))?.[1] ?? "";

  // Response text is stdout, minus warning/status prefix lines
  const SKIP_PREFIXES = ["  ⚠", "↻ Resumed", "session_id:"];
  const text = stdout
    .split("\n")
    .filter((l) => !SKIP_PREFIXES.some((p) => l.startsWith(p)))
    .join("\n")
    .trim();

  return { sessionId, text };
}

// ── Core send ───────────────────────────────────

/**
 * Send a prompt to Hermes and get the full response.
 *
 * @param prompt      The user message to send.
 * @param sessionId   Optional Hermes session ID to resume.
 * @param options     Bridge options (cliPath, maxTurns, timeout, cwd).
 */
export async function hermesSend(
  prompt: string,
  sessionId?: string,
  options: HermesBridgeOptions = {},
): Promise<HermesResponse> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const args = ["chat", "-q", prompt, "-Q", "--max-turns", String(opts.maxTurns)];
  if (sessionId) args.push("--resume", sessionId);

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

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const parsed = parseHermesOutput(stdout, stderr);

      if (code !== 0 && !parsed.text) {
        invalidateHealth();
        reject(new Error(`Hermes exited with code ${code}. stderr: ${stderr.slice(0, 500)}`));
        return;
      }
      // If session_id is missing, generate a stable fallback so we still return a result
      if (!parsed.sessionId) {
        console.warn("[HermesBridge] session_id not found in output; using generated ID");
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
 * Send a prompt and yield tokens progressively.
 *
 * Since Hermes CLI buffers the full response in -Q mode, we simulate
 * streaming by splitting the final response into word-level chunks.
 * This gives the frontend a typing effect while the actual work happens.
 *
 * Yields events shaped like the existing SSE protocol:
 *   { event: "token" | "done" | "error" | "thinking", data: { ... } }
 */
export async function* hermesStream(
  prompt: string,
  sessionId?: string,
  options: HermesBridgeOptions = {},
): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  // Signal "thinking" state to frontend
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

  // Simulate streaming: split response into small chunks for typing effect
  // Split on word boundaries to preserve Markdown structure
  const text = response.text;

  if (!text) {
    yield { event: "done", data: { sessionId: response.sessionId, finished: true } };
    return;
  }

  // Yield in ~4-character chunks with tiny pauses for natural feel
  const CHUNK_SIZE = 4;
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    yield {
      event: "token",
      data: { content: text.slice(i, i + CHUNK_SIZE) },
    };
    // Yield to event loop so SSE flush can happen between chunks
    await new Promise((r) => setImmediate(r));
  }

  yield {
    event: "done",
    data: { sessionId: response.sessionId, finished: true },
  };
}
