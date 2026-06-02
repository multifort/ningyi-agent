# 宁翼智能助手 — 整体开发计划

> 基于 `docs/architecture.md` 和各模块详细设计。
> 每个 Phase 交付可独立运行、可测试的增量版本。

---

## Phase 1：用户认证 + 对话持久化（约 3-4 天）

**目标：用户可注册登录，对话数据持久化到 SQLite，前后端完整打通。**

### 1.1 后端基础设施
| 任务 | 文件 | 说明 |
|------|------|------|
| 安装依赖 | `server/package.json` | `better-sqlite3`, `bcryptjs`, `jsonwebtoken` + types |
| 数据库初始化 | `server/src/db.ts` | 建表 + WAL 模式 + 导出 db 实例 |
| UUID 工具 | `server/src/utils.ts` | `crypto.randomUUID()` 封装 |

**估时：** 0.5 天

### 1.2 用户认证
| 任务 | 文件 | 说明 |
|------|------|------|
| Auth 路由 | `server/src/auth.ts` | register / login / me / updateProfile |
| Auth 中间件 | `server/src/middleware/auth.ts` | JWT 验证 + userId 注入 |
| 注册主入口 | `server/src/index.ts` | 挂载 auth 路由，app.use(authMiddleware) 保护 /api/chat |

**估时：** 1 天

### 1.3 对话持久化
| 任务 | 文件 | 说明 |
|------|------|------|
| 对话 CRUD API | `server/src/conversations.ts` | list / create / rename / delete / getMessages |
| 聊天改造 | `server/src/chat.ts` | conversationId 参数、保存消息到 DB、注入 system prompt |
| 路由挂载 | `server/src/index.ts` | 挂载 conversations 路由 |

**估时：** 1 天

### 1.4 前端认证体系
| 任务 | 文件 | 说明 |
|------|------|------|
| AuthProvider | `web/src/components/AuthProvider.tsx` | Context + Provider，登录/注册/登出 |
| LoginPage | `web/src/components/LoginPage.tsx` | 登录表单 + 切换到注册 |
| RegisterPage | `web/src/components/RegisterPage.tsx` | 注册表单 + 切换到登录 |
| API 层改造 | `web/src/api.ts` | 所有请求带 token，401 自动登出 |
| 入口改造 | `web/src/App.tsx` | 未登录显示登录页，已登录显示聊天 |

**估时：** 1 天

### 1.5 前端对话管理
| 任务 | 文件 | 说明 |
|------|------|------|
| ChatState 改造 | `web/src/types.ts` | 对接后端 conversations API |
| Sidebar 改造 | `web/src/components/Sidebar.tsx` | 显示用户信息 + 登出按钮 |
| 对话重命名 | `web/src/components/Sidebar.tsx` | 双击编辑标题 |
| 对话切换加载 | `web/src/App.tsx` | 切换到历史对话时 GET messages |

**估时：** 0.5 天

### 1.6 测试与验证
| 任务 | 说明 |
|------|------|
| Auth API 测试 | vitest + supertest 测 register/login/me |
| Chat API 测试 | 带 token 的流式对话测试 |
| 前端冒烟测试 | 注册 → 登录 → 发消息 → 刷新保持 → 切换对话 |

**估时：** 0.5 天

**Phase 1 总计：约 3.5 天**

---

## Phase 2：体验增强（约 3-4 天）

**目标：系统提示词、API Key 配置、文件上传、代码复制、联网搜索、快捷键。**

### 2.1 系统提示词 + API Key
| 任务 | 文件 | 说明 |
|------|------|------|
| Settings 扩展 | `web/src/components/Settings.tsx` | systemPrompt + apiKey 字段 |
| 后端 profile API | `server/src/auth.ts` | updateProfile |
| Chat 集成 | `server/src/chat.ts` | 读取 user.system_prompt，使用 user.api_key（优先于全局 KEY） |

**估时：** 0.5 天

### 2.2 文件上传
| 任务 | 文件 | 说明 |
|------|------|------|
| 上传端点 | `server/src/upload.ts` | multer 接收文件，返回 fileId |
| 前端上传 | `web/src/components/ChatInput.tsx` | 粘贴/拖拽/点击上传 |
| Chat 集成 | `server/src/chat.ts` | 文件内容注入 messages |

**估时：** 1 天

### 2.3 代码块复制
| 任务 | 文件 | 说明 |
|------|------|------|
| 代码块按钮 | `web/src/components/ChatMessages.tsx` | 每个 code block 右上角复制按钮 |
| 复制动画 | CSS | 复制成功 ✓ 反馈 |

**估时：** 0.25 天

### 2.4 联网搜索
| 任务 | 文件 | 说明 |
|------|------|------|
| 搜索开关 | `web/src/components/ChatInput.tsx` | 输入框旁 toggle |
| 搜索代理 | `server/src/search.ts` | 调用搜索 API，格式化结果 |
| Chat 集成 | `server/src/chat.ts` | search=true 时注入搜索结果 |
| 引用展示 | 前端 | done 事件附加引用列表 |

**估时：** 1 天

### 2.5 快捷键
| 任务 | 文件 | 说明 |
|------|------|------|
| 快捷键 hook | `web/src/hooks/useKeyboard.ts` | Ctrl+K 新建对话等 |

**估时：** 0.25 天

**Phase 2 总计：约 3 天**

---

## Phase 3：高级能力（约 4-5 天）

**目标：多模型切换、对话搜索、快捷指令、知识库、LaTeX、导出分享。**

### 3.1 多模型切换
| 任务 | 文件 | 说明 |
|------|------|------|
| 模型选择器 | `web/src/components/ModelPicker.tsx` | 下拉选择模型 |
| 后端适配 | `server/src/chat.ts` | model 参数动态路由 |

**估时：** 0.5 天

### 3.2 对话搜索
| 任务 | 文件 | 说明 |
|------|------|------|
| FTS5 索引 | `server/src/db.ts` | messages 全文索引 |
| 搜索 API | `server/src/conversations.ts` | GET /api/conversations/search |
| 搜索 UI | `web/src/components/Sidebar.tsx` | 搜索框 |

**估时：** 0.5 天

### 3.3 快捷指令
| 任务 | 文件 | 说明 |
|------|------|------|
| 指令系统 | `web/src/components/ChatInput.tsx` | `/clear` `/model` `/search` 等 |

**估时：** 0.5 天

### 3.4 LaTeX 渲染
| 任务 | 文件 | 说明 |
|------|------|------|
| KaTeX 集成 | `web/src/components/ChatMessages.tsx` | react-markdown + remark-math + rehype-katex |

**估时：** 0.25 天

### 3.5 知识库（RAG）
| 任务 | 文件 | 说明 |
|------|------|------|
| 文档上传 | `server/src/upload.ts` | 扩展支持 PDF/Word/TXT |
| 文本分块 | `server/src/knowledge.ts` | 分块 + 存储 |
| 向量检索 | `server/src/knowledge.ts` | 简单关键词匹配（或集成 embedding） |
| RAG 注入 | `server/src/chat.ts` | 检索相关片段注入 context |

**估时：** 1.5 天

### 3.6 导出与分享
| 任务 | 文件 | 说明 |
|------|------|------|
| 导出 Markdown | `server/src/conversations.ts` | GET /api/conversations/:id/export |
| 分享链接 | `server/src/share.ts` | 生成只读 token + 分享页面 |

**估时：** 1 天

**Phase 3 总计：约 4.25 天**

---

## Phase 4：细节打磨（约 2-3 天）

**目标：语音输入、Mermaid、对话分支、通知、PWA。**

| 任务 | 估时 |
|------|------|
| 语音输入（Web Speech API） | 0.5 天 |
| Mermaid 图表渲染 | 0.25 天 |
| 对话分支 | 0.5 天 |
| 桌面通知 | 0.25 天 |
| PWA 支持 | 0.5 天 |
| 多标签对话 | 1 天 |
| 对话归档/置顶 | 0.5 天 |

**Phase 4 总计：约 3.5 天**

---

## Phase 5：对话增强与推理展示（约 3-4 天）

**目标：对话重命名、粘贴图片、思考过程、Token 统计等高频刚需。**

| 优先级 | 任务 | 文件 | 估时 | 说明 |
|--------|------|------|------|------|
| ⭐⭐⭐ | 对话重命名 | `Sidebar.tsx` | 0.25 天 | 双击标题 → inline 编辑 → PUT API |
| ⭐⭐⭐ | 粘贴图片 | `ChatInput.tsx` + `server/src/upload.ts` | 1 天 | Ctrl+V 粘贴截图，上传后注入对话 |
| ⭐⭐⭐ | 思考过程展示 | `ChatMessages.tsx` + `server/src/chat.ts` | 0.5 天 | DeepSeek R1 reasoning_content 折叠渲染 |
| ⭐⭐⭐ | Token 用量统计 | `Sidebar.tsx` + `server/src/chat.ts` | 0.5 天 | 侧栏显示每条对话 token 消耗 |
| ⭐⭐ | 继续生成 | `ChatInput.tsx` + `server/src/chat.ts` | 0.5 天 | 回答中断后点按钮继续补全 |
| ⭐⭐ | @提及 | `ChatInput.tsx` | 0.5 天 | 输入 @ 引用历史消息 |

**估时：约 3.25 天**

---

## Phase 6：知识库与协作（约 4-5 天）

**目标：知识库 RAG、URL 解析、对话分享、提示词模板等进阶能力。**

| 优先级 | 任务 | 文件 | 估时 | 说明 |
|--------|------|------|------|------|
| ⭐⭐⭐ | 知识库 RAG | `server/src/knowledge.ts` + DB | 2 天 | 文档分块 + 关键词检索 + 注入 context |
| ⭐⭐⭐ | URL 解析 | `server/src/fetch-url.ts` | 0.5 天 | 粘贴链接自动抓取网页文本内容 |
| ⭐⭐⭐ | 对话分享链接 | `server/src/share.ts` + SharePage | 1 天 | 生成只读 token + 匿名查看页面 |
| ⭐⭐ | 提示词模板 | `ChatInput.tsx` | 0.5 天 | 输入框快捷选择翻译/编程等场景模板 |
| ⭐⭐ | 网页摘要 | `server/src/fetch-url.ts` | 0.25 天 | 对话中总结 URL 内容 |
| ⭐ | 引用来源标注 | 前端 + `server/src/chat.ts` | 0.5 天 | 联网搜索时显示来源链接 |

**估时：约 4.75 天**

---

## Phase 7：体验与分支（约 2-3 天）

**目标：Mermaid 图表、对话分支、分享链接、批量操作、字体语言等细节。**

| 优先级 | 任务 | 文件 | 估时 | 说明 |
|--------|------|------|------|------|
| ⭐⭐ | Mermaid 图表渲染 | `ChatMessages.tsx` + mermaid lib | 0.5 天 | 代码块标记 mermaid → SVG 渲染 |
| ⭐⭐ | 批量操作 | `Sidebar.tsx` + `conversations.ts` | 0.5 天 | 多选对话批量删除/导出 |
| ⭐ | 对话分支 | `types.ts` + Sidebar 树形 | 1 天 | 从某条消息分叉出平行对话线 |
| ⭐ | 字体大小调节 | Settings + CSS 变量 | 0.25 天 | 小/中/大三种字号 |
| ⭐ | 语言切换 | i18n 基础 | 0.5 天 | 中/英文界面切换 |
| ⭐ | 多标签对话 | App.tsx 多 Tab | 1 天 | 同时打开多个对话标签页 |

**估时：约 3.75 天**

---

## 总时间线预估

| Phase | 内容 | 估时 | 累计 |
|-------|------|------|------|
| Phase 1 | 认证 + 持久化 | 3.5 天 | ✅ 已完成 |
| Phase 2 | 体验增强 | 3 天 | ✅ 已完成 |
| Phase 3 | 高级能力 | 4.25 天 | ✅ 已完成 |
| Phase 4 | 细节打磨 | 3.5 天 | ✅ 已完成 |
| **Phase 5** | **对话增强与推理** | **3.25 天** | **待确认** |
| **Phase 6** | **知识库与协作** | **4.75 天** | **待确认** |
| **Phase 7** | **体验与分支** | **3.75 天** | **待确认** |

**剩余总计：约 11.75 个工作日，可在 2.5 周内完成全部 44 项功能。**

---

## 优先级速览

| 任务 | 优先级 | Phase |
|------|--------|-------|
| 对话重命名 | ⭐⭐⭐ | P5 |
| 粘贴图片 | ⭐⭐⭐ | P5 |
| 思考过程展示 | ⭐⭐⭐ | P5 |
| Token 用量统计 | ⭐⭐⭐ | P5 |
| 知识库 RAG | ⭐⭐⭐ | P6 |
| URL 解析 | ⭐⭐⭐ | P6 |
| 对话分享链接 | ⭐⭐⭐ | P6 |
| 继续生成 | ⭐⭐ | P5 |
| @提及 | ⭐⭐ | P5 |
| 提示词模板 | ⭐⭐ | P6 |
| Mermaid 图表 | ⭐⭐ | P7 |
| 批量操作 | ⭐⭐ | P7 |
| 网页摘要 | ⭐⭐ | P6 |
| 引用来源标注 | ⭐ | P6 |
| 对话分支 | ⭐ | P7 |
| 字体大小调节 | ⭐ | P7 |
| 语言切换 | ⭐ | P7 |
| 多标签对话 | ⭐ | P7 |

---

## 开发原则
1. **每个 Phase 可独立交付** — 完成后即可部署使用
2. **先跑通再优化** — 功能优先于性能/美观
3. **测试跟随** — 每个 API 端点至少一个集成测试
4. **ADR 记录** — 架构决策写入 `docs/decisions/`
5. **向后兼容** — 数据库迁移不丢数据，API 不过度破坏
6. **安全第一** — 密码哈希、API Key 永不泄露、SQL 注入防护
