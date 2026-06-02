# 数据库详细设计

## 概述
SQLite 3，单文件部署（`data/hermes.db`），通过 `better-sqlite3` 同步 API 访问。零配置，文件即数据库。

## 环境
- 库：better-sqlite3 (v11+)
- 文件路径：`<project_root>/data/hermes.db`（自动创建）
- WAL 模式：启用，提升并发读性能
- 外键：启用 `PRAGMA foreign_keys = ON`

## 表结构

### users — 用户表
```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password      TEXT    NOT NULL,          -- bcryptjs hash ($2a$10$...)
  avatar        TEXT,                      -- base64 data URL (≤ 64KB)
  display_name  TEXT    NOT NULL DEFAULT '',
  system_prompt TEXT    NOT NULL DEFAULT '',
  api_key       TEXT,                      -- 用户自配 DeepSeek API Key
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_users_username ON users(username);
```

字段说明：
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 用户唯一 ID |
| username | TEXT | UNIQUE NOT NULL | 3-30 字符，[a-zA-Z0-9_] |
| password | TEXT | NOT NULL | bcryptjs 哈希，60 字符 |
| avatar | TEXT | NULLABLE | base64 PNG，256x256 以内 |
| display_name | TEXT | DEFAULT '' | 显示名称，最长 20 字符 |
| system_prompt | TEXT | DEFAULT '' | 系统提示词，最长 2000 字符 |
| api_key | TEXT | NULLABLE | 用户 DeepSeek API Key |
| created_at | TEXT | DEFAULT now | ISO 8601 时间戳 |
| updated_at | TEXT | DEFAULT now | 更新时需手动更新 |

### conversations — 对话表
```sql
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT    PRIMARY KEY,         -- UUID v4
  user_id     INTEGER NOT NULL,
  title       TEXT    NOT NULL DEFAULT '新对话',
  model       TEXT    NOT NULL DEFAULT 'deepseek-chat',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_conv_user_updated ON conversations(user_id, updated_at DESC);
```

字段说明：
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| user_id | INTEGER | FK → users.id | 所属用户 |
| title | TEXT | DEFAULT '新对话' | 对话标题，首条用户消息前 30 字 |
| model | TEXT | DEFAULT 'deepseek-chat' | 使用的模型 |
| created_at | TEXT | DEFAULT now | ISO 8601 |
| updated_at | TEXT | DEFAULT now | 最后活动时间 |

### messages — 消息表
```sql
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT    PRIMARY KEY,     -- UUID v4
  conversation_id TEXT    NOT NULL,
  role            TEXT    NOT NULL CHECK(role IN ('user','assistant','system')),
  content         TEXT    NOT NULL,
  token_count     INTEGER DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_msg_conv_created ON messages(conversation_id, created_at);
```

字段说明：
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| conversation_id | TEXT | FK → conversations.id | 所属对话 |
| role | TEXT | CHECK | user / assistant / system |
| content | TEXT | NOT NULL | 消息内容 |
| token_count | INTEGER | DEFAULT 0 | 该消息 token 消耗（仅 assistant） |
| created_at | TEXT | DEFAULT now | 消息时间 |

### knowledge_base — 知识库表（Phase 3）
```sql
CREATE TABLE IF NOT EXISTS knowledge_base (
  id          TEXT    PRIMARY KEY,         -- UUID
  user_id     INTEGER NOT NULL,
  name        TEXT    NOT NULL,            -- 文档名称
  content     TEXT    NOT NULL,            -- 提取的文本内容
  file_path   TEXT,                        -- 原始文件路径
  chunk_count INTEGER DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## 初始化脚本 (db.ts)

```typescript
import Database from 'better-sqlite3';
import path from 'node:path';

const DB_PATH = path.resolve(process.cwd(), 'data', 'hermes.db');

// 确保 data 目录存在
import { mkdirSync } from 'node:fs';
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// 性能优化
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (...);
  CREATE TABLE IF NOT EXISTS conversations (...);
  CREATE TABLE IF NOT EXISTS messages (...);
`);

export default db;
```

## 数据访问模式

### 用户操作
```typescript
// 创建用户
const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
stmt.run(username, hashedPassword);

// 按用户名查找
const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
stmt.get(username);

// 更新资料
const stmt = db.prepare(`
  UPDATE users SET display_name = ?, avatar = ?, system_prompt = ?, api_key = ?, updated_at = datetime('now')
  WHERE id = ?
`);
```

### 对话操作
```typescript
// 用户对话列表（按更新时间降序）
const stmt = db.prepare(`
  SELECT c.*, (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
  FROM conversations c
  WHERE c.user_id = ?
  ORDER BY c.updated_at DESC
`);

// 创建对话
const stmt = db.prepare('INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)');

// 重命名
const stmt = db.prepare('UPDATE conversations SET title = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?');
```

### 消息操作
```typescript
// 对话消息
const stmt = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at');

// 插入消息
const stmt = db.prepare('INSERT INTO messages (id, conversation_id, role, content, token_count) VALUES (?, ?, ?, ?, ?)');
```

## 迁移策略
- Phase 1：使用 `CREATE TABLE IF NOT EXISTS`，无需迁移
- Phase 2+：通过版本号表 + SQL 迁移脚本
```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);
```

## 备份与恢复
- 单文件 SQLite，备份即复制 `data/hermes.db`
- 定期备份建议：cron job 每日复制到备份目录
