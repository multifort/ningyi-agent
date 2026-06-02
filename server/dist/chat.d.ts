/**
 * POST /api/chat — SSE proxy to DeepSeek chat API with persistence.
 */
import type { Response } from "express";
import type { AuthRequest } from "./middleware/auth.js";
export declare function validateRequest(body: unknown): string | null;
export declare function handleChat(req: AuthRequest, res: Response): Promise<void>;
