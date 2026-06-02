# Hermes 集成设计与任务文档

> 目标：将 Hermes Agent 能力融入宁翼智能助手 Web 应用，从「DeepSeek 代理聊天工具」
> 升级为「具备工具调用、技能体系、记忆管理、任务编排能力的完整 AI 助手」。
>
> 文档版本：v1.0  
> 状态：待评审

---

## 一、现状差距分析

### 当前 Chat App 能力
| 能力 | 状态 |
|------|------|
| 多轮文本对话 | ✅ |
| SSE 流式响应 | ✅ |
| 对话持久化 | ✅ |
| 用户认证 | ✅ |
| 知识库（基础 RAG） | ✅ |
| Markdown/LaTeX/Mermaid 渲染 | ✅ |
| 工具调用（函数调用） | ❌ |
| 多步任务编排 | ❌ |
| 技能体系（Skills） | ❌ |
| 持久化记忆（Memory） | ❌ |
| 自动化/定时任务 | ❌ |
| 代码执行沙箱 | ❌ |
| 联网搜索（真实） | ❌ |

### Hermes Agent 能力
- **工具执行**：Bash、文件读写、Web 搜索、浏览器控制
- **技能体系**：可触发的可复用流程（project-spec、definition-of-done 等）
- **任务编排**：multi-step plan-execute-review 循环
- **委托子代理**：`delegate_task` 并行执行独立任务
- **记忆管理**：MEMORY.md（全局）+ docs（项目级）+ session search
- **定时任务**：cron 调度（需 gateway daemon）
- **消息网关**：Telegram / Slack / Discord 等平台接入
- **计划模式**：先规划不执行，生成 `.hermes/plans/` 文件

### 集成后目标
```
Browser (React SPA)
    ↕ SSE + REST
Express Server (Node :8787)
    ↕ HTTP / IPC
Hermes Agent Runtime              ← 新增层
    ├── Skills Engine
    ├── Memory Store
    ├── Tool Executor (Bash/Search/Browser)
    └── Task Orchestrator
          ↓
    LLM Provider (DeepSeek / 可扩展)
```

---

## 二、集成架构设计

### 2.1 核心决策：双模式架构

聊天界面支持两种独立模式，用户可随时切换：

| 模式 | 后端路径 | 适用场景 | 响应特征 |
|------|---------|---------|---------|
| **Chat 模式**（现有） | Express → DeepSeek | 快速问答、写作、翻译 | 低延迟，纯文本流 |
| **Agent 模式**（新增） | Express → Hermes Bridge → Hermes | 代码任务、多步调研、自动化 | 含工具调用过程，多阶段输出 |

两个模式**共用同一个对话界面**，Agent 模式在消息流中额外插入工具调用卡片和进度节点。

### 2.2 通信协议：Hermes Bridge

Express 与 Hermes 之间建立一个 **Bridge 模块**，负责：
1. 管理 Hermes 进程的生命周期（start/stop/health）
2. 将 REST 请求转换为 Hermes 消息格式
3. 将 Hermes 的事件流转换为 SSE 推回前端

**协议选型**（按优先级）：
- **首选：Hermes Gateway HTTP API**  
  Hermes 启动本地 gateway，Bridge 通过 HTTP 向其发送消息并接收回调 webhook。
- **备选：Subprocess + stdio**  
  Bridge 以子进程方式启动 `hermes -p "..."` 并解析 stdout 流。适用于无法使用 gateway 的场景。

### 2.3 SSE 事件扩展

现有 SSE 事件类型：`token` / `reasoning` / `done` / `error`

Agent 模式新增事件类型：
```
event: tool_start   → { toolName, input, stepId }
event: tool_end     → { stepId, output, durationMs }
event: step_start   → { stepIndex, total, description }
event: step_done    → { stepIndex, summary }
event: plan         → { steps: string[] }          // 计划模式展示
event: memory_used  → { key, snippet }             // 引用了记忆
event: skill_start  → { skillName }
event: skill_done   → { skillName, result }
```

### 2.4 数据库新增表

```sql
-- Agent 会话上下文，关联普通对话
CREATE TABLE agent_sessions (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  hermes_session  TEXT,              -- Hermes 内部 session ID（如有）
  mode            TEXT NOT NULL DEFAULT 'chat',  -- 'chat' | 'agent'
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 工具调用记录（可追溯、可复现）
CREATE TABLE tool_calls (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id      TEXT,              -- 关联的 assistant message
  step_index      INTEGER,
  tool_name       TEXT NOT NULL,
  input           TEXT,              -- JSON
  output          TEXT,              -- JSON
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending/running/done/error
  duration_ms     INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 用户记忆（持久化跨会话上下文）
CREATE TABLE memories (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  content    TEXT NOT NULL,
  source     TEXT,                   -- 'auto' | 'manual'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, key)
);

-- 技能调用历史
CREATE TABLE skill_invocations (
  id              TEXT PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  skill_name      TEXT NOT NULL,
  input           TEXT,
  output          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 定时任务（用户级别的 cron）
CREATE TABLE scheduled_tasks (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  schedule    TEXT NOT NULL,         -- cron 表达式或 ISO 时间
  prompt      TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 三、分阶段任务清单

> 每个任务包含：目标、涉及文件、验收标准、依赖关系。

---

### Phase 1：Hermes Bridge 基础通道
**目标**：在 Express 与 Hermes 之间建立可靠的通信通道，支持发送消息并接收流式响应。

---

#### T1-1：Hermes Bridge 模块
- **文件**：`server/src/hermes-bridge.ts`（新建）
- **内容**：
  - `HermesBridge` 类，封装与 Hermes 的通信逻辑
  - 支持两种模式：`gateway`（HTTP）和 `subprocess`（CLI）
  - `send(message, options)` 方法：发送消息，返回 AsyncIterable 事件流
  - `health()` 方法：检测 Hermes 是否就绪
  - 自动重连机制（指数退避，最多 5 次）
  - 连接状态缓存，避免每次请求重新建连
- **验收**：
  - `hermesBridge.health()` 在 Hermes 运行时返回 `true`
  - 发送一条消息后能收到至少一个事件
  - 单元测试覆盖：gateway 模式、subprocess 模式、重连逻辑

---

#### T1-2：agent_sessions / tool_calls 数据库迁移
- **文件**：`server/src/db.ts`
- **内容**：
  - 新增 `agent_sessions`、`tool_calls`、`memories`、`skill_invocations`、`scheduled_tasks` 五张表
  - 存量数据库平滑迁移（ALTER TABLE 方式）
  - 为 `tool_calls.conversation_id + created_at` 加联合索引
- **验收**：
  - 服务启动后五张表存在
  - 已有对话数据不受影响

---

#### T1-3：Agent 模式聊天路由
- **文件**：`server/src/chat.ts`、`server/src/agent-chat.ts`（新建）
- **内容**：
  - `POST /api/chat` 根据请求体中的 `mode: "agent"` 分支到 `handleAgentChat`
  - `handleAgentChat`：调用 `HermesBridge.send()`，将返回的事件流转换为标准 SSE 格式（含新事件类型）
  - 工具调用开始/结束时写入 `tool_calls` 表
  - 任务完成时保存 assistant 消息（包含工具调用摘要）
- **验收**：
  - 发送 `{ mode: "agent", messages: [...] }` 能收到 SSE 流
  - `tool_calls` 表有对应记录
  - Chat 模式（无 `mode` 或 `mode: "chat"`）行为不变

---

#### T1-4：健康检查扩展
- **文件**：`server/src/index.ts`
- **内容**：
  - `GET /api/health` 新增 `hermes: "ok" | "offline" | "not_configured"` 字段
  - 环境变量 `HERMES_GATEWAY_URL`（可选，默认 `http://localhost:5800`）
- **验收**：
  - Hermes 运行时 `health.hermes === "ok"`
  - Hermes 未运行时 `health.hermes === "offline"`，整体 `status` 仍为 `"ok"`（降级，不报错）

---

### Phase 2：Agent 模式前端
**目标**：在聊天界面中完整呈现 Agent 模式的工具调用过程和多步进度。

---

#### T2-1：模式切换 UI
- **文件**：`web/src/App.tsx`、`web/src/components/ChatInput.tsx`
- **内容**：
  - `ChatInput` 新增模式切换按钮（Chat ⇌ Agent），图标区分（闪电图标 = Agent）
  - 全局状态 `chatMode: "chat" | "agent"`，持久化到 `localStorage`
  - Agent 模式时输入框有视觉提示（边框颜色或标签）
  - 模式状态传递到 `doStream()`，随请求体携带 `model: "agent"`
- **验收**：
  - 切换后刷新页面模式保持
  - Chat 模式请求体无 `mode` 字段（兼容现有后端）

---

#### T2-2：工具调用卡片组件
- **文件**：`web/src/components/ToolCallCard.tsx`（新建）、`web/src/components/ChatMessages.tsx`
- **内容**：
  - `ToolCallCard` 组件：展示工具名称、输入摘要、执行状态（loading/done/error）、耗时
  - 输入/输出内容可展开/收起（`<details>`）
  - 工具图标映射：`bash` → 终端图标，`web_search` → 搜索图标，`read_file` → 文件图标等
  - `ChatMessages` 渲染消息时，若 `message.toolCalls` 存在，在消息气泡上方渲染工具调用卡片列表
- **验收**：
  - `tool_start` 事件触发时卡片显示 loading 状态
  - `tool_end` 事件触发时显示结果和耗时
  - 工具调用出错时卡片显示红色 error 状态

---

#### T2-3：多步进度条组件
- **文件**：`web/src/components/StepProgress.tsx`（新建）
- **内容**：
  - 收到 `plan` 事件后，在聊天区顶部渲染步骤进度条（步骤编号 + 描述）
  - `step_start` / `step_done` 更新当前进度
  - 全部完成后自动折叠
  - 点击可展开查看详细步骤摘要
- **验收**：
  - 多步任务期间进度条实时更新
  - 任务完成后 3 秒自动折叠

---

#### T2-4：前端 SSE 解析扩展
- **文件**：`web/src/App.tsx`（`streamChatAuth` 函数）
- **内容**：
  - 新增对 `tool_start`、`tool_end`、`step_start`、`step_done`、`plan`、`memory_used`、`skill_start`、`skill_done` 事件的解析
  - 对应回调：`onToolStart`、`onToolEnd`、`onStepUpdate`、`onPlan`、`onMemoryUsed`、`onSkillUpdate`
  - `types.ts` 中 `Message` 类型新增 `toolCalls?: ToolCall[]`、`steps?: Step[]` 字段
- **验收**：
  - 每种新事件类型都有对应处理逻辑且不影响现有 `token` / `done` / `error` 处理

---

### Phase 3：Memory（记忆）系统
**目标**：让助手跨会话记住用户偏好、重要背景，并支持用户主动管理记忆。

---

#### T3-1：Memory API
- **文件**：`server/src/memory.ts`（新建）
- **内容**：
  - `GET /api/memory` — 列出当前用户的记忆条目
  - `POST /api/memory` — 手动添加记忆 `{ key, content }`
  - `PUT /api/memory/:id` — 更新内容
  - `DELETE /api/memory/:id` — 删除
  - `GET /api/memory/inject` — 获取应注入当前会话的记忆摘要（按相关性排序，最多 2000 字符）
- **验收**：
  - CRUD 接口均有权限校验（只能操作自己的记忆）
  - `/inject` 接口返回的文本可直接作为 system prompt 附加内容

---

#### T3-2：Agent 模式自动提取记忆
- **文件**：`server/src/agent-chat.ts`
- **内容**：
  - Agent 对话结束后，异步分析对话内容，提取值得长期记忆的信息（用户偏好、重要决策等）
  - 通过 DeepSeek 轻量调用（`deepseek-chat` 模型）完成提取，结构化为 `{ key, content }` 数组
  - 去重逻辑：已有同 key 的记忆则更新，否则插入
  - 仅在 Agent 模式对话中触发，普通 Chat 模式不触发
- **验收**：
  - 对话中提到「我喜欢用 TypeScript」后，`memories` 表有对应条目
  - 下次 Agent 模式对话，该记忆出现在 system prompt 中

---

#### T3-3：Memory 面板 UI
- **文件**：`web/src/components/MemoryPanel.tsx`（新建）、`web/src/components/Sidebar.tsx`
- **内容**：
  - Sidebar 底部新增「记忆」入口（脑部图标）
  - `MemoryPanel`：滑入式抽屉面板，展示记忆列表（key + content 摘要）
  - 支持手动添加、编辑、删除记忆
  - `memory_used` SSE 事件触发时，消息中对应记忆高亮提示（「引用了记忆：xxx」）
- **验收**：
  - 面板能完整 CRUD 操作
  - 对话中引用记忆时有可见提示

---

### Phase 4：Skills（技能）体系
**目标**：让用户在聊天中通过 `/` 命令直接调用 Hermes 技能。

---

#### T4-1：Skills 发现接口
- **文件**：`server/src/skills.ts`（新建）
- **内容**：
  - `GET /api/skills` — 返回可用技能列表（name、description、trigger、category）
  - 数据来源：调用 `hermes skills list --json` 并解析，加本地缓存（5 分钟 TTL）
  - 权限控制：可配置哪些技能对普通用户开放（环境变量 `ALLOWED_SKILLS`，默认全开）
- **验收**：
  - 接口返回技能列表，含描述和分类
  - Hermes 不可用时返回空列表而非报错

---

#### T4-2：技能调用接口
- **文件**：`server/src/skills.ts`
- **内容**：
  - `POST /api/skills/:name/invoke` — 调用指定技能，请求体 `{ input, conversationId? }`
  - 写入 `skill_invocations` 表（含状态跟踪）
  - 调用通过 `HermesBridge` 发送，响应以 SSE 形式流式返回
  - 技能执行超时：10 分钟（超时后发送 error 事件）
- **验收**：
  - 调用 `project-spec` 技能，能收到生成的 spec 文本流
  - 调用记录写入 `skill_invocations`

---

#### T4-3：斜杠命令 UI（`/` 触发）
- **文件**：`web/src/components/ChatInput.tsx`、`web/src/components/SlashMenu.tsx`（新建）
- **内容**：
  - 输入框输入 `/` 时弹出技能菜单（浮层，含搜索/过滤）
  - 键盘导航（↑↓ 选择，Enter 确认，Esc 关闭）
  - 选择技能后将 `skill:xxx` 附加到消息，发送时路由到技能调用接口
  - 技能执行结果以特殊消息气泡样式展示（区分于普通对话）
- **验收**：
  - 输入 `/` 后 200ms 内菜单出现
  - 选择技能后菜单关闭，消息框填入技能前缀
  - 键盘全程可操控

---

#### T4-4：斜杠命令内置预设
- **文件**：`web/src/components/SlashMenu.tsx`
- **内容**：
  - 无论 Hermes 是否可用，内置以下命令：
    - `/clear` — 清空当前对话
    - `/export` — 导出对话为 Markdown
    - `/share` — 生成分享链接并复制
    - `/new` — 新建对话
  - Hermes 可用时追加动态技能列表
- **验收**：
  - Hermes 离线时内置命令仍可用
  - 动态技能与内置命令在菜单中有视觉区分（分组显示）

---

### Phase 5：定时任务（Cron）
**目标**：让用户可以从聊天界面创建和管理定时 AI 任务。

---

#### T5-1：定时任务 API
- **文件**：`server/src/scheduler.ts`（新建）
- **内容**：
  - `GET /api/scheduler/tasks` — 列出用户定时任务
  - `POST /api/scheduler/tasks` — 创建任务 `{ name, schedule, prompt }`
  - `PUT /api/scheduler/tasks/:id` — 更新（enable/disable/修改 prompt）
  - `DELETE /api/scheduler/tasks/:id` — 删除
  - `GET /api/scheduler/tasks/:id/runs` — 查看执行历史
  - 调度执行器：服务启动后扫描 `scheduled_tasks` 表，计算 `next_run_at`，到时触发 `HermesBridge.send()`
  - cron 表达式解析（使用 `node-cron` 或手写轻量解析器）
- **验收**：
  - 创建 `schedule: "* * * * *"` 的任务，1 分钟内有执行记录
  - 任务结果保存为新对话（`conversations` 表）
  - 用户只能操作自己的任务

---

#### T5-2：定时任务面板 UI
- **文件**：`web/src/components/SchedulerPanel.tsx`（新建）、`web/src/components/Sidebar.tsx`
- **内容**：
  - Sidebar 新增「定时任务」入口（时钟图标，仅 Agent 模式或有任务时显示）
  - `SchedulerPanel`：任务列表（名称、计划、状态、下次执行时间）
  - 创建任务表单：名称、cron 表达式（含常用预设选项）、Prompt 内容
  - 开关切换（enable/disable）
  - 点击任务查看最近执行历史
- **验收**：
  - 创建任务后列表实时更新
  - 执行历史可点击查看完整对话

---

### Phase 6：配置与运维
**目标**：让部署和运维简单可靠，Hermes 不可用时应用依然正常运行。

---

#### T6-1：环境变量扩展
- **文件**：`.env.example`、`server/src/index.ts`、`Dockerfile`
- **新增环境变量**：
  ```
  HERMES_GATEWAY_URL=http://localhost:5800  # Hermes gateway 地址
  HERMES_API_KEY=                           # gateway 鉴权 key（如配置）
  HERMES_BRIDGE_MODE=gateway                # 'gateway' | 'subprocess'
  HERMES_CLI_PATH=hermes                    # subprocess 模式下的 CLI 路径
  ALLOWED_SKILLS=*                          # 开放的技能列表，* 表示全部
  AGENT_MEMORY_EXTRACTION=true             # 是否自动提取记忆
  ```
- **验收**：
  - 未配置 `HERMES_GATEWAY_URL` 时，Agent 模式请求返回 503 并有清晰错误信息
  - 配置了所有变量后，`/api/health` 返回 `hermes: "ok"`

---

#### T6-2：降级策略（Graceful Degradation）
- **文件**：`server/src/hermes-bridge.ts`、`server/src/agent-chat.ts`
- **内容**：
  - Hermes 不可用时，Agent 模式自动降级为 Chat 模式并通知前端（SSE `info` 事件）
  - 工具调用失败时，继续会话（跳过该工具调用，记录 error 状态）
  - Memory 提取失败静默忽略（不影响正常对话）
  - Bridge 健康状态每 30 秒心跳检测，不健康时在前端状态栏显示警告
- **验收**：
  - 停止 Hermes 后，发送 Agent 模式消息，前端显示「已自动切换为 Chat 模式」提示
  - Chat 模式对话完全不受 Hermes 状态影响

---

#### T6-3：Dockerfile 更新
- **文件**：`Dockerfile`
- **内容**：
  - 新增 Hermes CLI 安装步骤（按 Hermes 官方安装方式）
  - 配置 Hermes 以 `gateway` 模式随主进程启动（supervisor 或 Node.js 子进程管理）
  - 健康检查同时检测 Express (:8787) 和 Hermes gateway (:5800)
- **验收**：
  - `docker build` 成功
  - `docker run` 后 `/api/health` 返回 `hermes: "ok"`

---

#### T6-4：Makefile 开发命令扩展
- **文件**：`Makefile`
- **新增命令**：
  ```makefile
  make dev-agent     # 同时启动 前端 + 后端 + Hermes gateway
  make hermes-health # 检查 Hermes 连接状态
  make hermes-skills # 列出可用技能
  ```
- **验收**：
  - `make dev-agent` 在一个终端启动三个进程并统一输出日志

---

### Phase 7：测试与文档
**目标**：确保所有新功能有测试覆盖，文档更新到位。

---

#### T7-1：Bridge 单元测试
- **文件**：`server/tests/hermes-bridge.test.ts`（新建）
- **内容**：
  - Gateway 模式：mock HTTP，测试消息发送 + 事件流解析
  - Subprocess 模式：mock child_process，测试 stdin/stdout 交互
  - 重连逻辑：模拟连接断开，验证指数退避行为
  - 降级逻辑：Hermes 不可用时正确返回降级响应

---

#### T7-2：Agent Chat 集成测试
- **文件**：`server/tests/agent-chat.test.ts`（新建）
- **内容**：
  - mock `HermesBridge`，测试工具调用事件正确写入 DB
  - 测试 SSE 事件格式是否符合前端预期
  - 测试 `tool_start` → `tool_end` 状态流转

---

#### T7-3：Memory API 测试
- **文件**：`server/tests/memory.test.ts`（新建）
- **内容**：CRUD 接口权限隔离、`/inject` 内容格式

---

#### T7-4：架构文档更新
- **文件**：`docs/architecture.md`
- **内容**：
  - 新增 Hermes 层的架构图（在现有图基础上扩展）
  - 补充新增 API 端点列表（Memory / Skills / Scheduler）
  - 更新数据库 Schema 章节（五张新表）
  - 新增「Agent 模式数据流」章节

---

#### T7-5：ADR 记录
- **文件**：`docs/decisions/0003-hermes-integration-architecture.md`
- **内容**：
  - 记录双模式架构决策及备选方案
  - 记录 gateway vs subprocess 通信协议选型理由
  - 记录降级策略设计思路

---

## 四、依赖关系图

```
T1-1 (Bridge)
  └── T1-3 (Agent 路由)
        ├── T2-1 (模式切换 UI)
        │     └── T2-4 (SSE 解析扩展)
        │           ├── T2-2 (工具调用卡片)
        │           └── T2-3 (步骤进度条)
        ├── T3-2 (自动提取记忆) ← T3-1 (Memory API) ← T3-3 (Memory UI)
        └── T4-2 (技能调用) ← T4-1 (技能发现) ← T4-3 (斜杠命令 UI)
                                                          └── T4-4 (内置预设)

T1-2 (DB 迁移) ← 所有需要新表的任务

T5-1 (Scheduler API) ← T1-1 (Bridge) ← T5-2 (Scheduler UI)

T6-1 (环境变量) ← T6-2 (降级策略) ← T6-3 (Dockerfile)

T7-x (测试/文档) ← 各对应功能完成后并行
```

---

## 五、里程碑与优先级

| 里程碑 | 任务 | 交付物 | 优先级 |
|--------|------|--------|--------|
| **M1：Bridge 通道** | T1-1 ~ T1-4 | Agent 模式基础可用，工具调用有 SSE 输出 | 🔴 P0 |
| **M2：Agent UI** | T2-1 ~ T2-4 | 前端完整呈现工具调用和多步进度 | 🔴 P0 |
| **M3：Memory** | T3-1 ~ T3-3 | 跨会话记忆读写，自动提取 | 🟠 P1 |
| **M4：Skills** | T4-1 ~ T4-4 | 斜杠命令调用 Hermes 技能 | 🟠 P1 |
| **M5：Scheduler** | T5-1 ~ T5-2 | 定时任务创建和执行 | 🟡 P2 |
| **M6：运维** | T6-1 ~ T6-4 | 生产环境可部署，降级可靠 | 🟠 P1（与 M3 并行） |
| **M7：质量** | T7-1 ~ T7-5 | 测试覆盖率 ≥ 80%，文档完整 | 🟡 P2 |

---

## 六、风险与缓解措施

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Hermes gateway HTTP API 不稳定/文档缺失 | 中 | 高 | T1-1 同时实现 subprocess 备选模式；两种模式通过配置切换 |
| Hermes 延迟高导致用户体验差 | 中 | 中 | Agent 模式明确标注「深度推理，响应较慢」；步骤进度条让用户感知到进展 |
| 记忆自动提取幻觉（提取错误信息） | 中 | 中 | 提取结果入库前先展示给用户确认（可配置为「静默模式」或「确认模式」） |
| 工具调用执行危险命令（安全） | 低 | 极高 | Hermes 已有 `approvals.mode: manual` + Tirith 扫描；服务端二次校验 tool_name 白名单 |
| 定时任务 token 消耗失控 | 中 | 中 | 每个用户定时任务上限（默认 5 个）；每次执行有 token 上限（可配置） |
| Chat 模式被误升级为 Agent 模式影响性能 | 低 | 低 | 默认 Chat 模式；Agent 模式需用户主动切换；两个模式的路由完全独立 |

---

## 七、新增 API 一览

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/chat` | Bearer | 扩展：支持 `mode: "agent"` |
| GET | `/api/memory` | Bearer | 列出记忆 |
| POST | `/api/memory` | Bearer | 添加记忆 |
| PUT | `/api/memory/:id` | Bearer | 更新记忆 |
| DELETE | `/api/memory/:id` | Bearer | 删除记忆 |
| GET | `/api/memory/inject` | Bearer | 获取会话注入摘要 |
| GET | `/api/skills` | Bearer | 列出可用技能 |
| POST | `/api/skills/:name/invoke` | Bearer | 调用技能（SSE 流） |
| GET | `/api/skills/history` | Bearer | 技能调用历史 |
| GET | `/api/scheduler/tasks` | Bearer | 列出定时任务 |
| POST | `/api/scheduler/tasks` | Bearer | 创建定时任务 |
| PUT | `/api/scheduler/tasks/:id` | Bearer | 更新定时任务 |
| DELETE | `/api/scheduler/tasks/:id` | Bearer | 删除定时任务 |
| GET | `/api/scheduler/tasks/:id/runs` | Bearer | 执行历史 |
