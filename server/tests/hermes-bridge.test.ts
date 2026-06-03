/**
 * Tests for HermesBridge output parsers (pure functions, no subprocess).
 */
import { describe, it, expect } from "vitest";
import { parseVerboseOutput, parseQuietOutput } from "../src/hermes-bridge.js";

// Realistic verbose output (ANSI already present is fine; parser strips it).
const VERBOSE_SAMPLE = [
  "Query: use bash to echo hello",
  "Initializing agent...",
  "  ⚠ tirith security scanner enabled but not available — pattern matching only",
  "┊ 💻 preparing terminal…",
  "┊ 💻 $         echo hello  1.5s",
  "╭─ ⚕ Hermes ───────────────────────────────────────────────╮",
  "    The command printed hello and exited with code 0.",
  "╰──────────────────────────────────────────────────────────╯",
  "Resume this session with:",
  "  hermes --resume 20260603_090849_abc123",
  "Session:        20260603_090849_abc123",
  "Duration:       8s",
  "Messages:       4 (1 user, 2 tool calls)",
].join("\n");

describe("parseVerboseOutput", () => {
  it("extracts session id from the resume line", () => {
    const r = parseVerboseOutput(VERBOSE_SAMPLE, "");
    expect(r.sessionId).toBe("20260603_090849_abc123");
  });

  it("extracts the answer text from the Hermes box", () => {
    const r = parseVerboseOutput(VERBOSE_SAMPLE, "");
    expect(r.text).toContain("The command printed hello");
    expect(r.text).not.toContain("Duration");
    expect(r.text).not.toContain("Query:");
  });

  it("extracts the bash tool call with its command and duration", () => {
    const r = parseVerboseOutput(VERBOSE_SAMPLE, "");
    expect(r.toolEvents).toHaveLength(1);
    expect(r.toolEvents[0].name).toBe("bash");
    expect(r.toolEvents[0].detail).toContain("echo hello");
    expect(r.toolEvents[0].durationMs).toBe(1500);
  });

  it("skips the 'preparing terminal' placeholder", () => {
    const r = parseVerboseOutput(VERBOSE_SAMPLE, "");
    expect(r.toolEvents.every((t) => !t.detail.includes("preparing"))).toBe(true);
  });

  it("classifies search and file tool markers", () => {
    const out = [
      "┊ 🌐 $ search: weather today  0.8s",
      "┊ 📄 read config.json  0.2s",
      "╭─ ⚕ Hermes ──╮",
      "done",
      "╰──╯",
      "  hermes --resume sid_1",
    ].join("\n");
    const r = parseVerboseOutput(out, "");
    expect(r.toolEvents.map((t) => t.name)).toEqual(["web_search", "file"]);
  });
});

describe("parseQuietOutput", () => {
  it("reads session id from stderr and text from stdout", () => {
    const stdout = "  ⚠ tirith warning\n你好！有什么可以帮你的？";
    const stderr = "\nsession_id: 20260603_100000_xyz";
    const r = parseQuietOutput(stdout, stderr);
    expect(r.sessionId).toBe("20260603_100000_xyz");
    expect(r.text).toBe("你好！有什么可以帮你的？");
    expect(r.toolEvents).toEqual([]);
  });
});
