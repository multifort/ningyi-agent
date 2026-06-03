/**
 * Hermes Chat Server — Express with auth + SQLite persistence.
 */

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", ".env") });

import express from "express";
import cors from "cors";
import { handleChat } from "./chat.js";
import { handleAgentChat } from "./agent-chat.js";
import { hermesHealth } from "./hermes-bridge.js";
import memoryRoutes from "./memory.js";
import authRoutes from "./auth.js";
import conversationRoutes from "./conversations.js";
import knowledgeRoutes from "./knowledge.js";
import shareRoutes from "./share.js";
import fetchUrlRoutes from "./fetch-url.js";
import { authMiddleware } from "./middleware/auth.js";

const PORT = parseInt(process.env.PORT ?? "8787", 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173").split(",");

// ── Rate limiter (in-memory, no external dep) ───
// Allows up to MAX_HITS requests per window per IP, then returns 429.
function makeRateLimiter(maxHits: number, windowMs: number) {
  const counters = new Map<string, { count: number; resetAt: number }>();
  // Periodically sweep expired entries to prevent unbounded growth
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of counters) {
      if (now >= entry.resetAt) counters.delete(key);
    }
  }, windowMs).unref();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const entry = counters.get(ip);
    if (!entry || now >= entry.resetAt) {
      counters.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > maxHits) {
      res.status(429).json({ message: "请求过于频繁，请稍后再试" });
      return;
    }
    next();
  };
}

// 10 attempts per 15 minutes per IP on auth endpoints
const authRateLimiter = makeRateLimiter(10, 15 * 60 * 1000);

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, same-origin)
      if (!origin) return callback(null, true);
      // Check exact match
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      // Allow any localhost/127.0.0.1/local IP on port 5173
      if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):5173$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "1mb" }));

// ── Public routes ───────────────────────────────

// Health check
app.get("/api/health", async (_req, res) => {
  let deepseek = "unknown";
  try {
    const r = await fetch("https://api.deepseek.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    deepseek = r.ok ? "ok" : "auth_error";
  } catch (e) {
    deepseek = e instanceof Error ? e.message : "unreachable";
  }
  const hermes = await hermesHealth().catch(() => false) ? "ok" : "offline";

  res.json({
    status: "ok",
    keyLoaded: !!process.env.DEEPSEEK_API_KEY,
    deepseek,
    hermes,
  });
});

// Auth routes — rate-limited to block brute-force
app.use("/api/auth/login", authRateLimiter);
app.use("/api/auth/register", authRateLimiter);
app.use("/api", authRoutes);

// ── Protected routes ────────────────────────────

app.use("/api", authMiddleware, conversationRoutes);
app.use("/api", authMiddleware, knowledgeRoutes);
app.use("/api", authMiddleware, fetchUrlRoutes);
app.use("/api", authMiddleware, shareRoutes);
app.use("/api", memoryRoutes);
app.use(shareRoutes); // GET /share/:token is public

app.post("/api/chat", authMiddleware, (req, res) => {
  const mode = (req.body as Record<string, unknown>)?.mode;
  if (mode === "agent") return handleAgentChat(req, res);
  return handleChat(req, res);
});

// ── Start ───────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Hermes Chat Server listening on http://localhost:${PORT}`);
  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn("⚠  DEEPSEEK_API_KEY is not set — /api/chat will use per-user keys only.");
  }
});

export { app };
