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
import authRoutes from "./auth.js";
import conversationRoutes from "./conversations.js";
import knowledgeRoutes from "./knowledge.js";
import shareRoutes from "./share.js";
import fetchUrlRoutes from "./fetch-url.js";
import { authMiddleware } from "./middleware/auth.js";

const PORT = parseInt(process.env.PORT ?? "8787", 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173").split(",");

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
  res.json({
    status: "ok",
    keyLoaded: !!process.env.DEEPSEEK_API_KEY,
    deepseek,
  });
});

// Auth routes (no middleware needed)
app.use("/api", authRoutes);

// ── Protected routes ────────────────────────────

app.use("/api", authMiddleware, conversationRoutes);
app.use("/api", authMiddleware, knowledgeRoutes);
app.use("/api", authMiddleware, fetchUrlRoutes);
app.use("/api", authMiddleware, shareRoutes);
app.use(shareRoutes); // GET /share/:token is public

app.post("/api/chat", authMiddleware, handleChat);

// ── Start ───────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Hermes Chat Server listening on http://localhost:${PORT}`);
  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn("⚠  DEEPSEEK_API_KEY is not set — /api/chat will use per-user keys only.");
  }
});

export { app };
