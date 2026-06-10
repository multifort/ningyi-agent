import { api } from "./client";

export interface PreviewData {
  path: string;
  name: string;
  ext: string;
  type: "markdown" | "code" | "text";
  size: number;
  truncated: boolean;
  content: string;
}

export async function previewFile(path: string): Promise<PreviewData> {
  return api.get<PreviewData>(`/api/files/preview?path=${encodeURIComponent(path)}`);
}

/**
 * Extract an absolute file path from a tool-call input like
 * "write /Users/.../README.md" or "read /path/to/file". Returns null if none.
 */
export function extractFilePath(input: string | undefined): string | null {
  if (!input) return null;
  const m = /(\/[^\s'"]+\.[A-Za-z0-9]+)/.exec(input);
  return m ? m[1] : null;
}
