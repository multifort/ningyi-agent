/**
 * Hermes Chat Server — thin Express proxy for DeepSeek API.
 *
 * Reads DEEPSEEK_API_KEY from repo .env (via dotenv).
 * Single endpoint: POST /api/chat (SSE streaming).
 */

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env from project root (parent of server/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", "..", ".env");
config({ path: envPath });

import express from "express";
import cors from "cors";
import { handleChat } from "./chat.js";

const PORT = parseInt(process.env.PORT ?? "8787", 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "http://localhost:5173";

const app = express();

app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ["POST", "OPTIONS", "GET"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use(express.json({ limit: "1mb" }));

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
  res.json({ status: "ok", keyLoaded: !!process.env.DEEPSEEK_API_KEY, deepseek });
});

// Main chat endpoint
app.post("/api/chat", handleChat);

app.listen(PORT, () => {
  console.log(`Hermes Chat Server listening on http://localhost:${PORT}`);
  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn("⚠  DEEPSEEK_API_KEY is not set — /api/chat will return errors.");
  }
});

export { app };
