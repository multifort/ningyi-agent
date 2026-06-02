# 认证模块详细设计

## 概述
基于 JWT + bcryptjs + SQLite 的用户认证系统。支持注册、登录、token 验证、个人信息管理。

## API 详解

### POST /api/auth/register
```
Request:
  { "username": "string (3-30 chars, [a-zA-Z0-9_])", "password": "string (6-100 chars)" }

Response 201:
  { "token": "jwt_string", "user": { "id": 1, "username": "foo", "displayName": "foo", "avatar": null } }

Response 409:
  { "message": "用户名已存在" }

Response 400:
  { "message": "用户名格式错误" }  // 或 "密码长度不足"
```

### POST /api/auth/login
```
Request:
  { "username": "string", "password": "string" }

Response 200:
  { "token": "jwt_string", "user": { "id": 1, "username": "...", "displayName": "...", "avatar": "..." } }

Response 401:
  { "message": "用户名或密码错误" }
```

### GET /api/auth/me
```
Headers: Authorization: Bearer <token>

Response 200:
  { "user": { "id": 1, "username": "...", "displayName": "...", "avatar": "...", "systemPrompt": "...", "hasApiKey": false } }

Response 401:
  { "message": "无效或过期的 token" }
```

### PUT /api/auth/profile
```
Headers: Authorization: Bearer <token>
Request:
  { "displayName": "string?", "avatar": "string(base64)?", "systemPrompt": "string?", "apiKey": "string?" }
  // 只传需要更新的字段

Response 200:
  { "user": { ... } }
```

## JWT 设计
- 算法：HS256
- 密钥：环境变量 `JWT_SECRET`（默认 `hermes-chat-secret-change-me`）
- 载荷：`{ userId: number, username: string, iat, exp }`
- 有效期：7 天
- 无刷新机制（Phase 1 范围内）

## 密码策略
- 使用 bcryptjs，salt rounds = 10
- 最小长度 6，最大 100
- 存储格式：`$2a$10$...` 60 字符哈希

## Auth 中间件（authMiddleware）
```typescript
// server/src/middleware/auth.ts
// 1. 从 Authorization header 提取 Bearer token
// 2. jwt.verify(token, JWT_SECRET)
// 3. 验证用户是否存在于数据库
// 4. 注入 req.userId
// 5. 失败返回 401
```

## 数据库表
```
users:
  id            INTEGER PRIMARY KEY AUTOINCREMENT
  username      TEXT UNIQUE NOT NULL
  password      TEXT NOT NULL           -- bcrypt hash
  avatar        TEXT                    -- base64 data URL or null
  display_name  TEXT DEFAULT ''
  system_prompt TEXT DEFAULT ''
  api_key       TEXT                    -- user-provided API key (encrypted?)
  created_at    TEXT DEFAULT datetime('now')
  updated_at    TEXT DEFAULT datetime('now')
```

## 前端认证流程
```
1. App 启动 → AuthProvider mount
2. 检查 localStorage('auth-token')
3. 有 token → GET /api/auth/me 验证
   - 有效 → 设置 user 状态，显示聊天界面
   - 401 → 清除 token，显示登录页
4. 无 token → 显示登录页
5. 登录成功 → 存 token 到 localStorage → 设置 user 状态
6. 登出 → 清除 localStorage token + user → 显示登录页
7. 所有 fetch 通过 api.ts 统一注入 Authorization header
8. 任何 API 返回 401 → 自动登出
```

## 安全考虑
- JWT_SECRET 必须通过环境变量配置，生产环境使用强随机字符串
- bcrypt 抗彩虹表、抗暴力破解（10 rounds 约 100ms/次）
- 用户名大小写敏感，防止混淆攻击
- API Key 字段考虑加密存储（Phase 1 明文，后续加应用层加密）
- 密码不在日志、响应、数据库中明文出现
