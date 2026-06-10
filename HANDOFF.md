# 移动端开发交接文档 (HANDOFF)

> 新对话接续开发时，**先完整读这份文档**。它记录了项目状态、环境要求、
> 已完成工作、待办清单和踩过的坑。读完即可无缝继续。

最后更新：2026-06-09

---

## 0. 一句话背景

宁翼智能 — React + Express5 + SQLite + DeepSeek 的聊天应用，含 **Web 端**和
**移动端(Expo SDK 56 / RN 0.85 / iOS)**。当前任务：**把 Web 端已有但移动端
缺失的能力补齐到移动端**，修复过程中发现的 bug，打包到稳定版交付验收。

---

## 1. ⚠️ 环境与路径（极其重要，踩过坑）

- **项目根目录必须是纯英文路径**：`/Users/lining/workspace/hermes-test`
  - 旧路径 `/Users/lining/程序/workspace/...` 含中文，会导致 CocoaPods 的
    React Native 预编译库解压失败（`bad component ... expected absolute path`）。
    **不要在中文路径下构建。**
- **本地构建/pod 需要正确的 PATH 和 Ruby/CocoaPods**：
  ```bash
  export PATH="/usr/bin:/opt/homebrew/opt/ruby/bin:/opt/homebrew/lib/ruby/gems/4.0.0/bin:$PATH"
  export LANG=en_US.UTF-8
  ```
  - 系统自带 curl（`/usr/bin/curl`）— Anaconda 的 curl 会导致 pod 下载 SSL 失败。
  - CocoaPods 用 Homebrew Ruby 装的 **1.15.2**（1.16.x 与 RN0.85 不兼容，
    报 `React-Core-prebuilt ... Missing required attribute source`）。
- **hermes CLI** 在 `/Users/lining/.local/bin/hermes`。后端必须能找到它，
  已通过 `server/.env` 配置 `HERMES_CLI_PATH=/Users/lining/.local/bin/hermes`。
  - 后端进程的 PATH 不含 `~/.local/bin` 时，agent 会报"Hermes Agent 当前不可用"。

---

## 2. 启动与构建命令

### 后端（端口 8787）
```bash
cd /Users/lining/workspace/hermes-test/server
export PATH="/Users/lining/.local/bin:$PATH"
npm run dev          # tsx watch，热重载
```
- **只能有一个后端进程**。多个进程抢 8787 会崩溃循环导致登录 500。
  排查：`lsof -nP -iTCP:8787 -sTCP:LISTEN`，多余的 kill 掉。
- 测试登录（注意 sandbox 里 curl localhost 会 HTTP 000，需 dangerouslyDisableSandbox）：
  ```bash
  curl -s -X POST http://127.0.0.1:8787/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"difftest99","password":"test1234"}'
  ```

### Web 端（端口 5174）
```bash
cd /Users/lining/workspace/hermes-test && npm run dev:web
```

### TypeScript 检查（tsc bin symlink 坏了，用绝对路径）
```bash
cd /Users/lining/workspace/hermes-test/mobile
node ../node_modules/typescript/lib/tsc.js --noEmit
```

### 移动端打包（EAS，ad-hoc internal 分发，扫码安装免 TestFlight）
```bash
export PATH="/usr/bin:/opt/homebrew/opt/ruby/bin:/opt/homebrew/lib/ruby/gems/4.0.0/bin:$PATH"
export LANG=en_US.UTF-8
cd /Users/lining/workspace/hermes-test/mobile
# 每次打包前必须递增 app.json 里的 ios.buildNumber（用 Edit 工具改，不要用 sed）
eas build --platform ios --profile preview --non-interactive
```
- profile `preview` = internal 分发（已注册设备 UDID `00008120-00065D461E38C01E`，iPhone 14 Pro，iOS 26.5）。
- EAS 账号 `multifort`，bundleId `com.multifort.expogo`，ascAppId `6776556540`。
- `/ios` 已 gitignore，EAS 云端重新 prebuild，新加的原生模块(如 expo-clipboard)会自动 autolink。

---

## 3. 版本与打包记录（活数据，每次打包后更新）

- **当前 app.json buildNumber**：`14`（下次打包改成 `15`）
- **真相源（不依赖记忆）**：`eas build:list --platform ios` 查云端永久记录
- **本轮 PC 能力补齐的打包**：
  - `build#12` = #1 搜索 + #4 分享 + #8 代码块复制
  - `build#13` = #6 文档预览 + #7 斜杠命令 + skills bug 修复
  - `build#14` = #2 深色模式（全部屏 + 设置里主题切换）+ `userInterfaceStyle: automatic`
- **深色模式说明**：主题系统在 `mobile/src/theme/`（colors.ts 调色板 / useColors.ts 钩子）
  + `mobile/src/stores/themeStore.ts`（mode: system/light/dark，持久化）。各屏用
  `const styles = useMemo(() => makeStyles(colors), [colors])` 模式。`app.json` 的
  `userInterfaceStyle` 必须是 `automatic`（设 light 会让 useColorScheme 永远返回 light）。

---

## 4. 关键架构 / 数据约定

- **API 响应都包了一层！** 移动端 api 调用必须解包：
  - `GET /api/conversations` → `{conversations:[...]}`
  - `GET /api/conversations/:id/messages` → `{messages:[...]}`
  - `POST /api/conversations` → `{conversation:{...}}`
  - 见 `mobile/src/api/conversations.ts`，新接 API 时注意后端返回结构。
- **SSE 流式格式**：后端发 `event: <type>\ndata: {...}\n\n`，type 在 event 行、
  data 里没有 type。移动端 `mobile/src/lib/sse.ts` 解析时合并 event+data 成 `{type, ...data}`。
- **Chat vs Agent 模式**：同一端点 `POST /api/chat`，body 带 `mode:"agent"` 时
  后端转发到 `handleAgentChat`（hermes CLI）。agent 是 CLI 批处理后模拟打字
  （`server/src/hermes-bridge.ts`，chunk 间 `setTimeout(18ms)` 才能真流式）。
- **移动端 API 客户端**：`mobile/src/api/client.ts`，`api.get/post/put/delete`，
  baseURL 来自 `useSettingsStore`，token 在 expo-secure-store。

---

## 5. ✅ 已完成（已打包验证到 build#11）

修复类：
- React 版本统一（monorepo overrides → 19.2.3）
- iOS 打包链路：bundleId、eas.json、Xcode 26.4 镜像（iOS26 兼容）、加密声明
- 中文路径导致 CocoaPods 预编译解压失败 → 迁移到纯英文路径
- SSE 解析 bug（event 行没解析导致对话无响应）
- agent 模式真流式（setImmediate → setTimeout 18ms）
- agent 不可用（HERMES_CLI_PATH 配置）
- 登录 500（多后端进程抢端口）
- 首页空列表（三个 conversation API 没解包）
- 停止按钮报错（expo FetchRequestCanceledException 未识别）+ 停止后残留"正在思考"

功能类（移动端已有）：
- 消息复制/编辑/重新生成（极简图标 ⎘ ✎ ↻）
- 对话标题居中 + 历史入口
- 代码块显示修复（fence 黑底浅字）
- agent 工具卡片可展开看命令/脚本
- "正在思考"动画 + 思考/回答/完成状态
- Web 端消息操作图标同步为极简风格

关键文件：
- `mobile/app/(app)/chat/[id].tsx` — 聊天主屏（doStream/handleSend/handleStop/handleEdit/handleRegenerate）
- `mobile/src/components/MessageBubble.tsx` — 消息气泡、ThinkingDots、ToolCallItem、markdownStyles
- `mobile/app/(app)/index.tsx` — 会话列表首页
- `mobile/src/api/conversations.ts` — 会话 API（已解包）
- `mobile/src/lib/sse.ts` — SSE 流式解析

---

## 6. ✅ PC 能力补齐：已全部完成（见状态/打包记录）

> 实测发现 HANDOFF 早期对后端的两条假设是错的（已纠正）：fork 无后端路由
> （web 仅本地 reducer），preview 是 `GET /api/files/preview?path=`（不是
> `/messages/:id/preview`）；knowledge 后端有 API 但 web 无 UI，故非"PC 能力"。

| # | 功能 | 后端路由（实际） | 状态 |
|---|------|---------|------|
| 1 | 会话搜索 | `GET /api/conversations/search?q=` | ✅ build#12 |
| 4 | 会话分享 | `POST /api/conversations/:id/share` → `{token,url,expiresAt}`；RN `Share` | ✅ build#12 |
| 8 | 代码块复制按钮 | 纯前端（MessageBubble `CodeBlock` + markdown `rules`） | ✅ build#12 |
| 6 | 文档预览 | `GET /api/files/preview?path=` → `{type,content,...}`；`DocumentPreview` 模态 | ✅ build#13 |
| 7 | 斜杠命令 | `GET /api/skills` + `POST /api/skills/:name/invoke`；`SlashMenu` + handleSend 路由 | ✅ build#13 |
| 2 | 深色模式 | 纯前端，主题系统在 `mobile/src/theme/` + `themeStore`，设置里切换 | ✅ build#14 |
| 3 | 知识库 | `/api/knowledge`（**跳过**：web 无对应 UI，非 PC 能力） | ⛔ 跳过 |
| 5 | 对话分叉 | （**跳过**：web 仅本地 reducer FORK_CONVERSATION，无后端，不适配移动端） | ⛔ 跳过 |

修复的 bug：`mobile/src/api/skills.ts` 三个路径缺 `/api` 前缀（导致 skills 全部 404）；
`invokeSkill` 的 SSE 解析漏了 `event:` 行（同 sse.ts 早期 bug）。

### 关键新增/改动文件（本轮）
- 新增 `mobile/src/theme/colors.ts`、`useColors.ts`、`mobile/src/stores/themeStore.ts`
- 新增 `mobile/src/api/files.ts`（previewFile + extractFilePath）
- 新增 `mobile/src/components/DocumentPreview.tsx`、`SlashMenu.tsx`
- 改 `mobile/app/_layout.tsx`（加载主题 + StatusBar + 内容背景）
- 各屏 StyleSheet → `makeStyles(c: Palette)` 主题化（index/chat/settings/memory/
  scheduler/skills/auth 三屏 + MessageBubble/SlashMenu/DocumentPreview）
- `chat/[id].tsx`：`doStream` 重构为 `runStream` 共享给 chat 与 skill 调用

---

## 7. ⚠️ 工作纪律（避免重复犯错）

- **读/搜/改文件只用 Read / Grep / Edit / Write 工具**，绝不用 Bash 的
  `cat`/`sed`/`grep`/`echo`。`sed -i` 在 app.json 上曾静默失败导致
  buildNumber 没改、还谎报了一个不存在的 "Build 10"。
- **绝不臆造工具输出**。打包/提交是否成功，必须看真实输出确认。
- 改 buildNumber 用 Read + Edit，改完 Read 确认。
- 用户偏好：常规创建文件/执行命令直接做不必每步确认；**删除/系统安全类操作严格禁止执行**。
- 全局记忆见 `~/.claude/memory/tooling-file-operations.md`。

---

## 8. 新对话怎么开场

新开对话时，对我说类似：

> 读 `/Users/lining/workspace/hermes-test/CLAUDE.md` 和 `HANDOFF.md`，继续补齐
> 移动端缺失的 PC 能力（HANDOFF 第 6 节待办清单），自主开发+打包+自测，
> 最终给我一个稳定版验收。

我读完就能接续。**每完成一批，我会更新本文档的第 3/5/6 节和 buildNumber。**
