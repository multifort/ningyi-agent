# 移动端客户端设计与任务文档

> 目标：为宁翼智能助手开发 **React Native (Expo) 手机客户端**，服务端继续运行在
> 用户自己的电脑上，手机通过 **Tailscale 私有网络**安全连接。多账号已由现有
> JWT 认证支持，面向「我和家人/小团队」使用。
>
> 文档版本：v1.0 · 状态：待评审

---

## 一、总体拓扑

```
┌─────────────────────┐         Tailscale 私有加密网络         ┌──────────────────────────┐
│   手机 (iOS/Android) │◀───────（WireGuard mesh，端到端）──────▶│   你的电脑（家里/任意网络）  │
│                     │                                        │                          │
│  Expo RN App        │   http://<电脑的 tailscale 名>:8787     │  Express :8787           │
│  ├ 认证 (SecureStore)│ ──────────────────────────────────────▶│  ├ /api/* (REST + SSE)   │
│  ├ 对话/Agent UI     │                                        │  ├ SQLite                │
│  ├ SSE 流式 (expo/fetch)                                       │  └ Hermes Bridge → Hermes│
│  └ 推送 (Expo Push) │                                        │      └ DeepSeek API      │
└─────────────────────┘                                        └──────────────────────────┘
        │                                                                    ▲
        │  离开家/4G/5G 时，Tailscale 依旧把两台设备放在同一虚拟内网            │
        └────────────────────────────────────────────────────────────────────┘
```

**核心理念**：手机端是一个**纯客户端**，不含任何业务逻辑/密钥；所有 AI 调用、数据
存储、Hermes 编排都在电脑端。手机只负责 UI + 调用现有 `/api/*` 接口。Tailscale 让
「电脑在 NAT 后、IP 会变」这个问题消失——两台设备永远在同一个虚拟内网里，且流量
全程加密。

---

## 二、关键技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 客户端框架 | **Expo (React Native)** | 原生体验最佳；Expo 托管工作流省去原生构建配置；EAS Build 远程出包 |
| 连接方式 | **Tailscale** | 无需端口转发/公网 IP/域名；WireGuard 端到端加密；MagicDNS 提供稳定主机名 |
| SSE 流式传输 | **`expo/fetch`（流式 fetch，SDK 52+）** | 保持服务端现有 SSE 契约不变；RN 原生 fetch 不支持 ReadableStream，expo/fetch 支持 |
| Token 存储 | **expo-secure-store** | iOS Keychain / Android Keystore，硬件级加密，比 AsyncStorage 安全 |
| 导航 | **expo-router** | 文件式路由，类型安全，深链接友好 |
| 状态管理 | **Zustand + TanStack Query** | 轻量；Query 负责服务端状态缓存/重试/离线 |
| 推送通知 | **Expo Notifications + Expo Push** | 即使服务端在家用电脑，推送也经 Expo 云中转，无需公网入口 |
| 代码复用 | **pnpm/npm workspace 单仓 + 共享 types 包** | 复用 TS 类型与 API 契约；UI 需用 RN 重写（无法直接复用 React DOM） |

> ⚠️ **不能直接复用现有 Web UI**：`web/` 是 React DOM（`<div>`/CSS），RN 用的是
> `<View>`/`<Text>`/StyleSheet。可复用的是：TypeScript 类型、API 调用层逻辑、
> reducer/状态机、Markdown 解析策略，而不是组件本身。

---

## 三、仓库结构（演进为 monorepo）

```
ningyi-ai/
├── server/                 # 不变（运行在电脑上）
├── web/                    # 不变（桌面浏览器）
├── mobile/                 # 新增：Expo RN App
│   ├── app/                # expo-router 路由
│   │   ├── (auth)/login.tsx
│   │   ├── (auth)/register.tsx
│   │   ├── (app)/index.tsx           # 对话列表 / 聊天主页
│   │   ├── (app)/chat/[id].tsx       # 单个对话
│   │   ├── (app)/settings.tsx
│   │   ├── (app)/memory.tsx
│   │   ├── (app)/skills.tsx
│   │   └── (app)/scheduler.tsx
│   ├── src/
│   │   ├── api/            # API 客户端（fetch 封装 + SSE）
│   │   ├── auth/           # AuthProvider + SecureStore
│   │   ├── components/     # RN 组件（ChatBubble, ToolCallCard…）
│   │   ├── stores/         # Zustand stores
│   │   └── lib/            # markdown 渲染、SSE 解析等
│   ├── app.json            # Expo 配置
│   └── eas.json            # EAS Build 配置
├── packages/
│   └── shared/             # 新增：共享 TS 类型 + API 契约常量
│       └── src/types.ts    # Message / Conversation / ToolCall / 事件类型
└── docs/
```

复用策略：把 `server` 与 `web` 中重复的领域类型（Message、Conversation、SSE 事件
形状）抽到 `packages/shared`，三端共同依赖，避免契约漂移。

---

## 四、连接层设计（Tailscale）

### 4.1 一次性设置
1. **电脑**：安装 Tailscale，登录，得到稳定主机名（MagicDNS，如 `my-mac.tailXXXX.ts.net`）。
2. **手机**：安装 Tailscale App，用同一账号登录，加入同一 tailnet。
3. 验证：手机浏览器访问 `http://my-mac.tailXXXX.ts.net:8787/api/health` 应返回 JSON。

### 4.2 服务端改动（很小）
- `app.listen(PORT)` 当前默认监听 `0.0.0.0`，Tailscale 接口天然可达 ✅
- **CORS 不影响原生 App**（RN 无 Origin），但需放开「无 Origin」请求（现有代码已允许 `!origin` 通过 ✅）。
- 新增环境变量 `ALLOWED_ORIGINS` 追加 tailnet 域名（仅为 Web 端口在 tailnet 打开时用）。
- **建议绑定到 Tailscale IP 而非全网**：通过 `HOST` 环境变量（默认 `0.0.0.0`，可设为
  Tailscale 的 `100.x.y.z`），减少在公共 Wi-Fi 下的暴露面。

### 4.3 客户端寻址
- App 设置页提供「服务器地址」输入框，默认填 MagicDNS 主机名 + 端口。
- 保存到 SecureStore，作为所有请求的 `baseURL`。
- 启动时 `GET /api/health` 探活，失败给出「检查 Tailscale 是否开启」的引导。

### 4.4 离开家时
Tailscale 在 4G/5G 下依旧维持虚拟内网，**无需任何额外配置**；若电脑休眠则不可达，
可在电脑端开启「防止休眠」或用 Tailscale 的 subnet/exit 节点策略（进阶，可选）。

---

## 五、SSE 流式传输（移动端最大技术风险）

现有 `/api/chat`、`/api/skills/:name/invoke` 是 **POST + Bearer + SSE**。浏览器的
`EventSource` 只支持 GET 且不带自定义头，所以 Web 端用的是 fetch+ReadableStream。
RN 的原生 `fetch` **不支持** ReadableStream，这是必须解决的点。

**方案（推荐）**：使用 **`expo/fetch`** 的流式响应（Expo SDK 52+ 提供 WHATWG 兼容的
streaming fetch），复用与 Web 端几乎相同的 SSE 解析逻辑（按 `\n` 分块、解析
`event:`/`data:`）。服务端**零改动**。

```ts
import { fetch } from 'expo/fetch';
const resp = await fetch(`${baseURL}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ messages, mode }),
});
const reader = resp.body.getReader();   // expo/fetch 支持
// …与 web/src/App.tsx 的解析逻辑一致
```

**备选方案**（若 expo/fetch 不可用）：
- XHR + `onprogress` 增量读取 `responseText`，手动 diff 新增片段解析 SSE。
- 或服务端新增 WebSocket 网关（改动较大，不推荐作为首选）。

---

## 六、移动端功能范围

按优先级分批，**首版聚焦核心对话体验**：

| 功能 | 首版 (MVP) | 复用现有 API |
|------|:---:|------|
| 登录 / 注册 | ✅ | `/auth/login` `/auth/register` |
| Token 持久化（SecureStore） | ✅ | `/auth/me` |
| 对话列表 / 新建 / 删除 | ✅ | `/conversations` CRUD |
| 多轮聊天 + SSE 流式 | ✅ | `/api/chat` |
| Chat / Agent 模式切换 | ✅ | `mode: "agent"` |
| 工具调用卡片展示 | ✅ | SSE `tool_start/tool_end` |
| Markdown 渲染 | ✅ | `react-native-markdown-display` |
| 停止生成 | ✅ | AbortController |
| 设置（头像/昵称/系统提示词/API Key/改密） | ✅ | `/auth/profile` `/auth/password` |
| 记忆管理 | 🟠 V2 | `/memory` CRUD |
| 技能 `/` 调用 | 🟠 V2 | `/skills` `/skills/:name/invoke` |
| 定时任务 | 🟠 V2 | `/scheduler/tasks` |
| 知识库上传 | 🟡 V3 | `/knowledge`（需原生文件选择器） |
| 对话分享 | 🟡 V3 | `/conversations/:id/share` |
| 推送通知（回复完成） | 🟡 V3 | 新增 Expo Push 集成 |
| 语音输入 | 🟡 V3 | `expo-speech` / 原生语音 |

---

## 七、分阶段任务清单

### Phase M0：脚手架与连通
- **M0-1** 初始化 monorepo workspace；抽 `packages/shared` 共享类型。
- **M0-2** `npx create-expo-app mobile`，接入 expo-router、TanStack Query、Zustand。
- **M0-3** API 客户端封装：`baseURL` 来自设置、统一 Bearer 注入、错误处理。
- **M0-4** 服务器地址设置页 + `/api/health` 探活引导（含 Tailscale 检查提示）。
- **验收**：手机连 Tailscale，App 能拉到 `/api/health` 并显示「在线」。

### Phase M1：认证
- **M1-1** 登录/注册页（RN UI）。
- **M1-2** Token 存入 SecureStore；AuthProvider + 启动自动登录（`/auth/me`）。
- **M1-3** 401 自动登出与跳转。
- **验收**：注册→登录→重启 App 保持登录→登出全链路通。

### Phase M2：核心聊天（MVP 心脏）
- **M2-1** 对话列表（拉取、新建、删除、下拉刷新）。
- **M2-2** 聊天界面：消息气泡、用户/助手区分、自动滚动。
- **M2-3** **SSE 流式**：用 expo/fetch 实现逐 token 渲染（复用 Web 解析逻辑）。
- **M2-4** Chat/Agent 模式切换；Agent 模式渲染 ToolCallCard。
- **M2-5** Markdown 渲染（代码块、列表）；停止生成按钮。
- **验收**：发消息能流式看到回复；Agent 模式能看到工具调用；停止可中断。

### Phase M3：设置与个性化
- **M3-1** 设置页：昵称、系统提示词、API Key、改密。
- **M3-2** 头像（expo-image-picker，base64 上传，复用 `/auth/profile`）。
- **M3-3** 深色/浅色主题（跟随系统）。
- **验收**：设置项保存后服务端生效，重启保持。

### Phase M4：进阶能力（记忆 / 技能 / 定时）
- **M4-1** 记忆面板（列表 + 增删改）。
- **M4-2** 技能：`/` 唤起技能选择，调用并流式展示结果。
- **M4-3** 定时任务：列表 + 创建（cron 预设选择器）+ 执行历史。
- **验收**：三个面板 CRUD 正常，与 Web 端数据互通。

### Phase M5：原生增强
- **M5-1** Expo Push：回复完成/定时任务触发时推送通知。
- **M5-2** 知识库文件上传（原生文件选择器）。
- **M5-3** 对话分享（系统分享面板 share sheet）。
- **M5-4** 语音输入。
- **验收**：后台收到推送；文件上传成功；分享可调起系统面板。

### Phase M6：构建与分发
- **M6-1** EAS Build 配置；iOS（TestFlight/Ad Hoc）+ Android（APK/AAB）。
- **M6-2** 家人/小团队分发：TestFlight 内部测试 或 直接装 APK。
- **M6-3** OTA 更新（expo-updates）：改 JS 不必重新出包。
- **验收**：家人手机能装上并正常使用。

---

## 八、安全设计

| 层 | 措施 |
|----|------|
| 网络 | Tailscale WireGuard 端到端加密；服务端可绑定到 Tailscale IP，不暴露公网 |
| 传输 | tailnet 内即使是 http 也在加密隧道内；如需可叠加 Tailscale 的 HTTPS 证书（`tailscale cert`） |
| 认证 | 复用现有 JWT（7 天过期 + token_version + 黑名单）；多账号隔离 |
| Token 存储 | SecureStore（Keychain/Keystore），不落 AsyncStorage/明文 |
| API Key | 永远只在服务端；手机端不持有 DeepSeek key |
| 设备丢失 | 服务端可改密使旧 token 失效；Tailscale 后台可移除该设备节点 |

---

## 九、关键风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| RN fetch 不支持流式 | Agent/聊天无法逐字显示 | 首选 expo/fetch；备选 XHR onprogress；最差降级为「整段返回」 |
| 电脑休眠/关机 → 不可达 | App 报错 | 启动探活 + 友好引导；电脑端建议关闭休眠或设唤醒策略 |
| Tailscale 未开启 | 全部请求失败 | health 探活失败时明确提示「请打开 Tailscale」 |
| Expo Push 需联网中转 | 推送依赖 Expo 云 | 可接受（仅推送走公网，数据仍在 tailnet）；或退化为本地通知 |
| 共享类型重构引入回归 | 现有 web/server 受影响 | 抽 shared 包时只搬类型不改逻辑，分步迁移 + 全量测试 |
| iOS 自签分发限制 | 家人安装麻烦 | 用 TestFlight 内部测试（最多 100 人，免审核内部组） |

---

## 十、里程碑建议

| 里程碑 | 阶段 | 产出 |
|--------|------|------|
| **可连通** | M0 | 手机经 Tailscale 看到服务端在线 |
| **可登录** | M1 | 账号体系打通 |
| **可聊天**（MVP） | M2 | 流式对话 + Agent 模式，**核心可用** |
| **好用** | M3 | 设置/主题/头像 |
| **能力完整** | M4 | 记忆/技能/定时 |
| **原生体验** | M5 | 推送/上传/分享/语音 |
| **可分发** | M6 | 家人装机使用 |

> 建议先打通 **M0→M1→M2** 形成可用闭环（手机上能流式聊天），再按需推进 M3+。
