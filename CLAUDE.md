# CLAUDE.md — 项目入口（每次新对话自动加载）

> **开始任何开发前,先完整读 `HANDOFF.md`(项目根)。** 它是这个项目的活文档,
> 记录环境要求、已完成工作、待办清单、踩过的坑,以及当前打包版本。
> 不读它直接动手,大概率会重复踩坑(中文路径、API 未解包、sed 静默失败等)。

## 当前状态看板（每次进展后更新；2026-06-09）

- **任务**: 把 Web 端已有、移动端缺失的能力补齐到移动端(iOS / Expo SDK56),
  修 bug,打包到稳定版交付验收。用户只做最终验收,中途自主推进不必逐项询问。
- **当前 mobile buildNumber**: `14`（下次打包用 `15`,改 `mobile/app.json` 的 `ios.buildNumber`）
- **打包历史真相源**: 跑 `eas build:list --platform ios`(云端永久记录,不依赖记忆)
- **进度（6 项 PC 能力补齐已全部完成，代码 + tsc 通过，已打包）**:
  - ✅ #1 会话搜索 / ✅ #4 会话分享 / ✅ #8 代码块复制按钮（build#12）
  - ✅ #6 文档预览 / ✅ #7 斜杠命令（build#13）
  - ✅ #2 深色模式（全部 12 屏 + 主题切换，build#14）
  - ⛔ #3 知识库 = 跳过(web 无对应 UI，非 PC 能力)
  - ⛔ #5 对话分叉 = 跳过(web 仅本地 reducer，无后端，不适配移动端)
  - 顺带修复的 bug: mobile skills API 缺 `/api` 前缀、skills SSE 解析(event 行)
- **待用户验收**: build#14。验收后若有视觉问题(尤其深色模式次要屏)再迭代。

## 铁律（详见 HANDOFF.md 第 7 节 + ~/.claude/memory/tooling-file-operations.md）

- 读/搜/改文件**只用 Read/Grep/Edit/Write**,绝不用 Bash 的 cat/sed/grep/echo
  (`sed -i` 改 app.json 曾静默失败、谎报过不存在的构建)。
- 绝不臆造工具输出;打包/提交成功必须看真实输出确认。
- 项目根必须是纯英文路径 `/Users/lining/workspace/hermes-test`(中文路径构建失败)。
- 删除/系统安全类操作严格禁止执行。
- 构建/打包/tsc/curl 的具体命令与环境变量见 HANDOFF.md 第 2 节。

## 子目录说明

- `mobile/` — Expo iOS 客户端(还有自己的 `mobile/CLAUDE.md` 讲 Expo 版本)
- `server/` — Express5 + SQLite 后端(端口 8787,只能跑一个进程)
- `web/` — Vite + React Web 端(端口 5174,8 项能力的参考实现)
