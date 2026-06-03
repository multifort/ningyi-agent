/**
 * Tests for the file-preview path safety logic.
 * Confirms allowed-root confinement and traversal rejection.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { checkPreviewPath, isWithinAllowedRoot } from "../src/files.js";

describe("file preview path safety", () => {
  let root: string;
  let outside: string;

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "fp-root-")));
    outside = realpathSync(mkdtempSync(join(tmpdir(), "fp-out-")));
    mkdirSync(join(root, "sub"), { recursive: true });
    writeFileSync(join(root, "README.md"), "# Hello\n");
    writeFileSync(join(root, "sub", "note.txt"), "hi");
    writeFileSync(join(outside, "secret.txt"), "TOP SECRET");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("accepts a file inside the allowed root", () => {
    const r = checkPreviewPath(join(root, "README.md"), [root]);
    expect(r.ok).toBe(true);
  });

  it("accepts a nested file inside the allowed root", () => {
    const r = checkPreviewPath(join(root, "sub", "note.txt"), [root]);
    expect(r.ok).toBe(true);
  });

  it("rejects a file outside the allowed root", () => {
    const r = checkPreviewPath(join(outside, "secret.txt"), [root]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("rejects path traversal escaping the root", () => {
    const r = checkPreviewPath(join(root, "..", "..", "etc", "hosts"), [root]);
    expect(r.ok).toBe(false);
  });

  it("rejects a symlink that points outside the root", () => {
    const link = join(root, "escape-link");
    symlinkSync(join(outside, "secret.txt"), link);
    const r = checkPreviewPath(link, [root]);
    expect(r.ok).toBe(false); // realpath resolves the link → outside → 403
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("404s a non-existent path", () => {
    const r = checkPreviewPath(join(root, "nope.md"), [root]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it("400s an empty path", () => {
    const r = checkPreviewPath("", [root]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("isWithinAllowedRoot guards the prefix boundary", () => {
    // /tmp/fp-root must not match /tmp/fp-root-evil
    expect(isWithinAllowedRoot(resolve(root + "-evil"), [root])).toBe(false);
  });
});
