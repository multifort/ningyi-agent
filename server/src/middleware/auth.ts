/**
 * Auth middleware — validates JWT Bearer token and injects userId.
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import db from "../db.js";

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "未提供认证令牌" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      username: string;
      tokenVersion?: number;
      jti?: string;
    };

    // Check blacklist (explicit logout)
    if (payload.jti) {
      const blocked = db
        .prepare("SELECT 1 FROM token_blacklist WHERE jti = ?")
        .get(payload.jti);
      if (blocked) {
        res.status(401).json({ message: "令牌已失效，请重新登录" });
        return;
      }
    }

    // Verify user still exists and token_version matches (password change invalidation)
    const user = db
      .prepare("SELECT id, token_version FROM users WHERE id = ?")
      .get(payload.userId) as { id: number; token_version: number } | undefined;

    if (!user) {
      res.status(401).json({ message: "用户不存在" });
      return;
    }

    if (
      payload.tokenVersion !== undefined &&
      payload.tokenVersion !== user.token_version
    ) {
      res.status(401).json({ message: "令牌已失效，请重新登录" });
      return;
    }

    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ message: "令牌无效或已过期" });
  }
}
