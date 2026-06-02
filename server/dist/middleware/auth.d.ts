/**
 * Auth middleware — validates JWT Bearer token and injects userId.
 */
import type { Request, Response, NextFunction } from "express";
export interface AuthRequest extends Request {
    userId?: number;
    username?: string;
}
export declare function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void;
