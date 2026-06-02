# 聊天模块详细设计

## 概述
核心对话功能：SSE 流式代理 + 对话持久化 + 消息管理。支持多轮对话、联网搜索、文件上下文。

## API 详解

### POST /api/chat — 主要聊天端点
```
Headers: Authorization: Bearer <token...uest:
{
  "conversationId": "string | undefined",  // 已有对话传 ID，新对话不传
  "messages": [
    { "role": "user|assistant|system", "content": "string" }
  ],
  "model": "string | undefined",           // 默认 deepseek-chat
  "search": false                           // 是否联网搜索
}
Response: Content-Type: text/event-stream

事件类型:
  event: token     data: { "content": "..." }          // 增量文本
  event: done      data: { "conversationId": "..." }    // 对话 ID（首次返回）
  event: error     data: { "message": "..." }           // 错误信息
```

处理流程：
```
1. Auth 中间件验证 token → req.userId
2. 校验 messages 数组（非空、角色合法、content 长度限制）
3. 确定 conversationId：
   - 有 → 加载历史消息，合并到 API 请求
   - 无 → 创建新对话（INSERT conversations）
4. 保存用户最新消息到 messages 表
5. 注入系统提示词（从 users.system_prompt 读取）
6. 构造完整 messages 数组发送给 DeepSeek
7. 流式接收 DeepSeek SSE 响应
8. 每个 token 转发给客户端 + 暂存到 buffer
9. 收到 [DONE] 后保存完整 assistant 消息到 messages 表
10. 发送 done 事件 + conversationId
11. 客户端断开时 abort 上游请求
```

### GET /api/conversations — 获取对话列表
```
Response 200:
{
  "conversations": [
    {
      "id": "uuid",
      "title": "关于 React 的讨论",
      "model": "deepseek-chat",
      "messageCount": 12,
      "updatedAt": "2026-06-01T10:00:00Z",
      "createdAt": "2026-06-01T09:00:00Z"
    }
  ]
}
```
- 按 updatedAt DESC 排序
- 返回当前用户所有对话
- messageCount 为子查询计数

### POST /api/conversations — 创建新对话
```
Request:  { "title": "string?" }
Response: { "conversation": { "id": "uuid", ... } }
```
- 空 body 或 title 为 "新对话" 均可

### PUT /api/conversations/:id — 重命名
```
Request:  { "title": "string (1-100 chars)" }
Response: { "conversation": { ... } }
```
- 仅对话所有者可操作
- 返回 404 如果对话不存在

### DELETE /api/conversations/:id — 删除对话
```
Response: { "success": true }
```
- CASCADE 删除关联消息

### GET /api/conversations/:id/messages — 获取对话消息
```
Response 200:
{
  "messages": [
    { "id": "uuid", "role": "user", "content": "...", "createdAt": "..." },
    { "id": "uuid", "role": "assistant", "content": "...", "tokenCount": 247, "createdAt": "..." }
  ]
}
```

### GET /api/conversations/search?q=keyword — 搜索对话
```
Response 200:
{ "results": [{ "conversationId": "uuid", "title": "...", "snippet": "...包含关键词的片段..." }] }
```
- Phase 3 功能，依赖 SQLite FTS5 全文索引

## 输入校验规则
```
messages:       非空数组，最多 200 条
role:           "user" | "assistant" | "system"
content:        非空字符串，最大 32000 字符
model:          deepseek-chat | deepseek-reasoner | (用户 API Key 可自定义)
search:         boolean
conversationId: UUID 格式
```

## System Prompt 注入策略
```
优先级：
1. 用户自定义 system_prompt（从 users 表读取）
2. 默认 prompt："你是宁翼智能助手，一个热情、专业的AI助手。用中文回复。"
3. 注入位置：messages 数组最前面
```

## 联网搜索
```
/search 参数为 true 时：
1. 调用 DeepSeek search API 或内置搜索代理
2. 搜索结果注入 context
3. 在 done 事件中附加引用来源
```

## 流式传输实现
```typescript
// 核心流程
const reader = upstreamResp.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // SSE 行解析: "data: {...}\n\n"
  // 提取 delta.content → sendSSE("token", { content })
}
sendSSE("done", { conversationId, tokenCount });
```

## Token 计数
- DeepSeek 响应中包含 usage 信息
- 解析最后一个 chunk 的 usage.total_tokens
- 存入 messages.token_count
- 汇总显示在设置/侧栏

## 错误处理
```
场景                        处理方式
DeepSeek API 不可达          endSSE("error", { message: "服务暂时不可用，请稍后重试" })
Token 耗尽/额度不足          endSSE("error", { message: "API 额度不足" })
输入超长                    endSSE("error", { message: "输入内容过长" })
客户端断开                   abort 上游请求，静默处理
上游超时 (60s)               endSSE("error", { message: "响应超时" })
```

## 文件上传集成（Phase 2）
```
POST /api/upload → 返回 fileId
POST /api/chat 时附加：
{
  "messages": [...],
  "fileIds": ["uploaded-file-uuid"],
  "search": false
}
后端读取文件内容 → 注入 messages 开头：
{ role: "system", content: "用户上传了文件，内容如下：\n...文件内容..." }
```
