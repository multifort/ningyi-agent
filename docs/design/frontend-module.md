# 前端模块详细设计

## 概述
React 19 + Vite 6 + TypeScript。SPA 单页应用，JWT 认证，SSE 流式消费。

## 目录结构（目标）
```
web/src/
├── components/
│   ├── AuthProvider.tsx      # 全局认证 Context + Provider
│   ├── LoginPage.tsx         # 登录页
│   ├── RegisterPage.tsx      # 注册页
│   ├── Sidebar.tsx           # 侧栏（对话列表 + 设置入口 + 用户信息）
│   ├── ChatMessages.tsx      # 消息列表 + 单条消息渲染
│   ├── ChatInput.tsx         # 输入框 + 文件上传 + 快捷指令
│   ├── Settings.tsx          # 设置弹窗
│   ├── ThemeProvider.tsx     # 主题切换
│   └── ProtectedRoute.tsx    # 路由守卫
├── hooks/
│   ├── useAuth.ts            # 认证 hook（封装 AuthContext）
│   └── useKeyboard.ts        # 快捷键 hook
├── api.ts                    # 统一 API 调用（自动带 token）
├── types.ts                  # 类型定义 + Reducer
├── App.tsx                   # 根组件
├── App.css                   # 全局样式
├── index.css                 # 重置样式
└── main.tsx                  # 入口
```

## 状态管理

### AuthContext
```typescript
interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;        // 启动时验证 token
}

interface User {
  id: number;
  username: string;
  displayName: string;
  avatar: string | null;
  systemPrompt: string;
  hasApiKey: boolean;
}

// Actions
login(username, password) → 成功存 token + user，失败抛错
register(username, password) → 成功存 token + user，失败抛错
logout() → 清空 token + user，跳转登录页
updateProfile(fields) → 更新 user 对象
```

### ChatState（useReducer）
```typescript
interface ChatState {
  conversations: Conversation[];    // 侧栏列表
  activeConversationId: string | null;
  messages: Message[];              // 当前对话消息（惰性加载）
  streaming: boolean;
  error: string | null;
  sidebarCollapsed: boolean;
}

// 关键 Actions
NEW_CONVERSATION          // 创建空对话
SELECT_CONVERSATION(id)   // 切换对话，触发加载消息
DELETE_CONVERSATION(id)
RENAME_CONVERSATION(id, title)
LOAD_MESSAGES(messages)   // 从 API 加载
ADD_MESSAGE(message)
APPEND_TOKEN(msgId, token)
SET_STREAMING(bool)
SET_ERROR(msg)
TOGGLE_SIDEBAR
```

## 路由设计

```
无路由库（Phase 1），通过 AuthContext.user 状态控制：
- user === null && !loading → 显示 LoginPage / RegisterPage
- user !== null → 显示 App（聊天主界面）

用 state 切换登录/注册页：authPage: "login" | "register"
```

## API 调用层 (api.ts)

```typescript
// 所有请求通过此模块，自动处理：
// 1. 注入 Authorization: Bearer <token...2. 401 响应自动触发 logout
// 3. 请求/响应类型安全

const api = {
  auth: {
    register(data) → Promise<{ token, user }>,
    login(data) → Promise<{ token, user }>,
    me() → Promise<{ user }>,
    updateProfile(data) → Promise<{ user }>,
  },
  chat: {
    stream(messages, callbacks, options?) → AbortController,
  },
  conversations: {
    list() → Promise<Conversation[]>,
    create(title?) → Promise<Conversation>,
    rename(id, title) → Promise<void>,
    delete(id) → Promise<void>,
    getMessages(id) → Promise<Message[]>,
    search(query) → Promise<SearchResult[]>,  // Phase 3
  },
  upload: {
    file(formData) → Promise<{ fileId }>,
  },
};
```

## 组件交互图

```
App
├── AuthProvider (Context Provider)
│   ├── LoginPage ──── POST /api/auth/login ──→ 成功 → setUser
│   └── RegisterPage ─ POST /api/auth/register → 成功 → setUser
│
└── [已登录] AppLayout
    ├── Sidebar
    │   ├── 对话列表 ← GET /api/conversations
    │   ├── 新建按钮 → POST /api/conversations
    │   ├── 重命名   → PUT /api/conversations/:id
    │   ├── 删除     → DELETE /api/conversations/:id
    │   ├── 设置入口 → setSettingsOpen(true)
    │   └── 用户信息 + 登出 → logout()
    │
    ├── ChatArea
    │   ├── 欢迎页（无消息时）
    │   └── ChatMessages
    │       ├── Message (user)     [📋复制] [✏️编辑]
    │       └── Message (assistant) [📋复制] [🔄重新生成]
    │
    ├── ChatInput
    │   ├── textarea (Enter 发送, Shift+Enter 换行)
    │   ├── 文件上传按钮 (Phase 2)
    │   └── 发送 / 停止按钮
    │
    └── Settings (Modal)
        ├── 头像上传
        ├── 显示名称
        ├── 系统提示词
        └── API Key 配置
```

## 快捷键设计

| 快捷键 | 功能 | Phase |
|--------|------|-------|
| Enter | 发送消息 | ✅ 已完成 |
| Shift+Enter | 换行 | ✅ 已完成 |
| Ctrl/Cmd + K | 新建对话 | Phase 2 |
| Ctrl/Cmd + / | 聚焦输入框 | Phase 2 |
| Ctrl/Cmd + Shift + C | 复制最后一条回复 | Phase 2 |
| Escape | 关闭设置弹窗 / 停止生成 | Phase 2 |

## 性能考虑
- 对话消息惰性加载：切换对话时才 GET messages
- 虚拟滚动：消息超过 500 条时启用（Phase 4）
- Markdown 渲染使用 react-markdown，避免 XSS
- 代码高亮使用 react-syntax-highlighter，按需加载语言包
- 头像 base64 存储 ≤ 64KB（256px PNG），localStorage 容量充足
