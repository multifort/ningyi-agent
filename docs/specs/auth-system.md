# Spec: 用户注册登录体系

## Goal
为宁翼智能助手增加完整的用户注册、登录、会话管理功能，使对话数据与用户账号绑定，支持多用户独立使用。

## Acceptance Criteria

### 用户注册（后端）
- `POST /api/auth/register` 接收 `{ username, password }`
- username 3-30 字符，仅允许字母数字下划线
- password 6-100 字符
- 用户名唯一，重复返回 409
- 密码使用 bcryptjs 哈希存储，永不返回原始密码
- 注册成功返回 JWT token + 用户信息

### 用户登录（后端）
- `POST /api/auth/login` 接收 `{ username, password }`
- 验证用户名密码，失败返回 401
- 成功返回 JWT token + 用户信息
- Token 有效期 7 天

### 认证中间件（后端）
- 所有 `/api/chat` 路由需要 Bearer token
- 无效/过期 token 返回 401
- Token 解析后将 `req.userId` 注入请求上下文

### 对话数据绑定（后端）
- 对话历史从浏览器内存迁移到 SQLite 持久化
- 每条对话记录关联 `userId`
- 用户只能看到/操作自己的对话

### 前端登录/注册页面
- 未登录时显示登录页面（含切换到注册的链接）
- 注册页面含用户名、密码、确认密码字段
- 登录成功后进入主聊天界面
- Token 存储在 localStorage，页面刷新保持登录

### 前端认证状态
- App 启动时检查 localStorage 中 token，调用 `/api/auth/me` 验证
- 无效 token 自动清除并跳转登录页
- 侧栏底部显示当前登录用户名
- 提供"退出登录"按钮

### 前端请求拦截
- 所有 `/api/` 请求自动附带 `Authorization: Bearer <token>` 头
- 收到 401 响应自动跳转登录页

## Out of Scope
- OAuth / 第三方登录（Google、GitHub 等）
- 邮箱验证、密码重置
- 角色权限（管理员 vs 普通用户）
- 多设备会话管理
- 速率限制 / 暴力破解防护
- 会话过期刷新

## Affected Areas
- `server/src/index.ts` — 新增 auth 路由，auth 中间件
- `server/src/auth.ts` — 新增：注册、登录、token 验证逻辑
- `server/src/db.ts` — 新增：SQLite 数据库初始化、用户/对话表
- `server/src/chat.ts` — 修改：对话关联 userId，读写 SQLite
- `web/src/` — 新增：AuthContext、LoginPage、RegisterPage
- `web/src/App.tsx` — 修改：包 AuthProvider，未登录跳转
- `web/src/api.ts` — 修改：请求带 token，401 处理
- `server/package.json` — 新增依赖

## Dependencies to Add
- `better-sqlite3` + `@types/better-sqlite3` — SQLite 数据库
- `bcryptjs` + `@types/bcryptjs` — 密码哈希
- `jsonwebtoken` + `@types/jsonwebtoken` — JWT

## Risks / Unknowns
- `better-sqlite3` 需要原生编译（C++ addon），macOS 上通常无问题，部署到其他平台需确认 Node 版本兼容
- 对话数据从内存迁移到 SQLite，前端当前使用 useReducer 管理消息，需要同步后端存储逻辑
- 现有对话已在侧栏显示但仅存内存，迁移后需从数据库加载

## Decisions to Record (ADR)
- ADR 0003: 选择 SQLite + JWT 作为认证方案（将创建）
