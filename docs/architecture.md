# Architecture

> 宁翼智能助手完整系统架构设计。
> 每个架构变更配 ADR 记录在 `docs/decisions/`。

---

## 一、系统概览

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (React SPA)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Login/   │  │ Chat UI  │  │ Sidebar  │  │ Settings    │ │
│  │ Register │  │ (stream) │  │ (history)│  │ (avatar/    │ │
│  │          │  │          │  │          │  │  prompt)    │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘ │
│                       │  POST /api/*                        │
│              AuthContext (JWT in localStorage)              │
└───────────────────────┼─────────────────────────────────────┘
                        │  Bearer token
┌───────────────────────┼─────────────────────────────────────┐
│               Node Express Server (server/)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Auth     │  │ Chat     │  │ File     │  │ Search      │ │
│  │ Routes   │  │ Proxy    │  │ Upload   │  │ Proxy       │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
│       │             │             │               │         │
│  ┌────┴─────────────┴─────────────┴───────────────┴──────┐ │
│  │                    SQLite Database                     │ │
│  │  ┌────────┐  ┌──────────────┐  ┌───────────────────┐  │ │
│  │  │ users  │  │ conversations│  │ knowledge_base    │  │ │
│  │  └────────┘  └──────────────┘  └───────────────────┘  │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│                       │  DEEPSEEK_API_KEY                    │
│                       ▼                                      │
│              DeepSeek Chat API (external)                    │
└─────────────────────────────────────────────────────────────┘
```

**核心原则：**
- API Key 永远在服务端，浏览器不可见
- 所有 `/api/*` 请求需 JWT 认证（`/api/auth/*` 除外）
- SQLite 单文件数据库，零配置部署
- SSE 流式响应端到端保持

---

## 二、组件职责

### 前端 (web/)

| 组件 | 职责 | 关键路径 |
|------|------|---------|
| AuthProvider | 全局认证状态管理，登录/注册/登出，token 持久化 | `web/src/components/AuthProvider.tsx` |
| LoginPage | 登录表单，含注册切换 | `web/src/components/LoginPage.tsx` |
| RegisterPage | 注册表单，含登录切换 | `web/src/components/RegisterPage.tsx` |
| App | 路由守卫，未登录跳登录页；布局编排 | `web/src/App.tsx` |
| Sidebar | 对话列表、新建/删除、设置入口、用户信息、登出 | `web/src/components/Sidebar.tsx` |
| ChatMessages | 消息渲染（Markdown + 代码高亮 + LaTeX）、操作按钮 | `web/src/components/ChatMessages.tsx` |
| ChatInput | 输入框、文件上传、快捷指令、停止生成 | `web/src/components/ChatInput.tsx` |
| Settings | 头像上传、显示名称、系统提示词、API Key 配置 | `web/src/components/Settings.tsx` |
| ThemeProvider | 深色/浅色主题切换 | `web/src/components/ThemeProvider.tsx` |

### 后端 (server/)

| 组件 | 职责 | 关键路径 |
|------|------|---------|
| 主入口 | Express 应用组装，中间件注册 | `server/src/index.ts` |
| Auth 路由 | 注册、登录、token 验证 | `server/src/auth.ts` |
| Auth 中间件 | JWT 验证，注入 userId | `server/src/middleware/auth.ts` |
| Chat 代理 | DeepSeek SSE 流式代理，输入校验，对话持久化 | `server/src/chat.ts` |
| 对话 API | CRUD：列表、重命名、删除、搜索 | `server/src/conversations.ts` |
| 文件上传 | 图片/文档上传处理 | `server/src/upload.ts` |
| 数据库 | SQLite 初始化、表创建、迁移 | `server/src/db.ts` |

### 外部依赖

| 依赖 | 用途 |
|------|------|
| DeepSeek Chat API | LLM 推理（OpenAI 兼容接口） |
| DeepSeek Search API | 联网搜索（后续） |

---

## 三、数据库设计 (SQLite)

```sql
-- 用户表
CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT    NOT NULL UNIQUE,
  password    TEXT    NOT NULL,        -- bcryptjs hash
  avatar      TEXT,                    -- base64 data URL
  display_name TEXT   DEFAULT '',
  system_prompt TEXT DEFAULT '',       -- 自定义系统提示词
  api_key     TEXT,                    -- 用户自配 API Key（可选）
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 对话表
CREATE TABLE conversations (
  id          TEXT    PRIMARY KEY,     -- UUID
  user_id     INTEGER NOT NULL REFERENCES users(id),
  title       TEXT    NOT NULL DEFAULT '新对话',
  model       TEXT    NOT NULL DEFAULT 'deepseek-chat',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 消息表
CREATE TABLE messages (
  id          TEXT    PRIMARY KEY,     -- UUID
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role        TEXT    NOT NULL CHECK(role IN ('user','assistant','system')),
  content     TEXT    NOT NULL,
  token_count INTEGER DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at DESC);
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_users_username ON users(username);
```

---

## 四、API 契约

### 认证相关

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | 否 | 注册 `{ username, password }` → `{ token, user }` |
| POST | `/api/auth/login` | 否 | 登录 `{ username, password }` → `{ token, user }` |
| GET | `/api/auth/me` | Bearer | 获取当前用户信息 |
| PUT | `/api/auth/profile` | Bearer | 更新头像/显示名称/系统提示词/API Key |

### 对话相关

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/chat` | Bearer | SSE 流式聊天 `{ conversationId?, messages }` |
| GET | `/api/conversations` | Bearer | 获取对话列表 |
| POST | `/api/conversations` | Bearer | 创建新对话 |
| PUT | `/api/conversations/:id` | Bearer | 重命名对话 `{ title }` |
| DELETE | `/api/conversations/:id` | Bearer | 删除对话 |
| GET | `/api/conversations/:id/messages` | Bearer | 获取对话消息 |
| GET | `/api/conversations/search?q=` | Bearer | 搜索对话 |

### 文件上传

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/upload` | Bearer | 上传文件（图片/文档） |

### 健康检查

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/health` | 否 | 服务健康检查 + DeepSeek 连通性 |

---

## 五、前端路由

```
未登录：
  / → LoginPage（含"去注册"链接）
  /register → RegisterPage（含"去登录"链接）

已登录：
  / → App（聊天主界面）
      ├── Sidebar（对话列表 + 设置入口 + 用户信息）
      ├── ChatArea（欢迎页 / 消息列表）
      └── ChatInput（输入框 + 文件上传）
  
  弹窗（不占路由）：
      Settings（头像、昵称、系统提示词、API Key）
```

---

## 六、数据流

### 登录流程
```
用户输入凭证 → POST /api/auth/login
  → 后端验证 bcrypt → 生成 JWT → 返回 { token, user }
  → 前端存入 localStorage → AuthContext 更新状态 → 跳转聊天页
```

### 聊天流程
```
用户输入消息 → 前端 ADD_MESSAGE → POST /api/chat (Bearer token)
  → Auth 中间件验证 token → 注入 userId
  → 校验输入 → 保存用户消息到 SQLite
  → 构造 messages（含 system prompt） → fetch DeepSeek API (stream)
  → SSE token 流 → 边接收边保存 assistant 消息
  → done 事件 → 最终保存
  → 前端逐 token 渲染
```

### 对话持久化
```
页面加载 → AuthContext 验证 token
  → GET /api/conversations → 渲染侧栏历史
  → 点击对话 → GET /api/conversations/:id/messages → 渲染消息列表
```

---

## 七、功能开发路线图

### Phase 1（核心认证 + 对话基础）— 当前
**目标：可注册登录，对话数据持久化**

| 功能 | 前端 | 后端 | 数据库 |
|------|------|------|--------|
| 用户注册/登录 | ✅ | ✅ | ✅ users 表 |
| JWT 认证中间件 | — | ✅ | — |
| 对话持久化 | — | ✅ | ✅ conversations/messages 表 |
| 对话 CRUD | ✅ | ✅ | ✅ |
| 对话重命名 | ✅ | ✅ | — |

### Phase 2（体验增强）— 高优先级
**目标：实用功能完善，用户体验提升**

| 功能 | 前端 | 后端 | 数据库 |
|------|------|------|--------|
| 系统提示词 | ✅ | ✅ | users.system_prompt |
| API Key 配置 | ✅ | ✅ | users.api_key |
| 文件上传（图片/文档） | ✅ | ✅ | 文件系统 |
| 代码块复制按钮 | ✅ | — | — |
| 联网搜索开关 | ✅ | ✅ | — |
| 快捷键支持 | ✅ | — | — |
| 清空当前对话 | ✅ | ✅ | — |

### Phase 3（高级能力）— 中优先级
**目标：多模型、知识库、分享协作**

| 功能 | 前端 | 后端 | 数据库 |
|------|------|------|--------|
| 多模型切换 | ✅ | ✅ | conversations.model |
| 对话搜索 | ✅ | ✅ | FTS5 全文索引 |
| 快捷指令 `/` | ✅ | — | — |
| 粘贴图片 | ✅ | ✅ | — |
| LaTeX 数学公式 | ✅ | — | — |
| 思考过程展示 | ✅ | ✅ | — |
| 知识库（RAG） | ✅ | ✅ | knowledge_base 表 |
| URL 解析 | ✅ | ✅ | — |
| 对话导出 | ✅ | ✅ | — |
| 对话分享链接 | ✅ | ✅ | — |
| 提示词模板 | ✅ | — | — |
| Token 用量统计 | ✅ | ✅ | messages.token_count |
| PWA 支持 | ✅ | — | — |
| 移动端适配 | ✅ | — | — |

### Phase 4（锦上添花）— 低优先级
**目标：细节打磨，边缘场景覆盖**

| 功能 |
|------|
| 语音输入 |
| Mermaid 图表渲染 |
| 对话分支/分叉 |
| 通知提醒 |
| 多标签对话 |
| 对话归档/置顶 |
| 引用来源标注 |
| 字体大小调节 |
| 语言切换 |

---

## 八、构建 / 测试 / 部署

- **安装：** `make install`
- **开发：** `make dev`（前端 :5173, 后端 :8787）
- **测试：** `make test`（vitest + supertest）
- **构建：** `make build`
- **质量门：** `make review`（lint + test）

---

## 九、ADR 索引

| ADR | 决策 | 日期 |
|-----|------|------|
| 0001 | 项目由 Hermes Agent 管理 | — |
| 0002 | 默认 provider DeepSeek | — |
| 0003 | SQLite + JWT 认证方案（待创建） | — |
