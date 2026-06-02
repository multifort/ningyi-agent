# 宁翼智能助手 UI 设计模式

## DeepSeek 风格深色主题

CSS 变量在 `:root` 定义（默认深色），`[data-theme="light"]` 覆盖浅色：

```css
:root {
  --bg-primary: #141416;     /* 主背景，不要纯黑 #000 */
  --bg-secondary: #1c1c1f;   /* 消息交替背景 */
  --bg-sidebar: #18181b;     /* 侧栏 */
  --bg-hover: #27272a;       /* hover 高亮 */
  --bg-input: #1e1e22;       /* 输入框 */
  --border: #2e2e33;         /* 边框，不要太亮 */
  --border-focus: #5b7cff;   /* 聚焦边框 */
  --text-primary: #e4e4e7;   /* 主文字 */
  --text-secondary: #a1a1aa; /* 次要文字 */
  --text-muted: #71717a;     /* 弱化文字 */
  --accent: #5b7cff;         /* 强调色，偏蓝紫 */
  --accent-hover: #6d8aff;
  --danger: #f87171;
}
```

## 左栏 + 右内容布局

经典双栏：`display: flex; height: 100vh; overflow: hidden;`
- 侧栏固定宽度 280px，可折叠到 56px
- 主内容区 `flex: 1; min-width: 0`

## 消息文档式风格

不要聊天气泡 — DeepSeek 是文档流风格：
- 每条消息 `display: flex; max-width: 768px; margin: 0 auto;`
- 用户消息：头像左 + 内容左对齐
- 助手消息：`flex-direction: row-reverse` 头像右
- 左右各占 85% max-width，避免撑满

## 元宝式输入框

输入框整体居中（max-width: 768px），工具栏内嵌在同一个圆角框内：
- 外层 `.chat-input-box` 居中 + 圆角边框
- 内层 textarea 在上，工具栏 `.chat-toolbar` 在下
- 工具栏 `display: flex; justify-content: space-between`
- 左侧：工具下拉 + 📎 + 🎤 + 🌐
- 右侧：▶ 继续 + ↑ 发送/⏹ 停止

## 登录页动画

- 背景图 `login_bg.png` + 深色渐变遮罩
- Canvas 粒子动画（60个浮动光点）
- SVG 三层波浪底部动画
- 表单卡片玻璃态效果：`backdrop-filter: blur(20px)`
- 主题切换按钮固定右上角：`position: fixed; border: none; background: transparent`

## 密码可见切换

Hover 时显示密码明文，离开显示密文：
```tsx
<div onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
  <input type={show ? "text" : "password"} />
  <span>{show ? "🙈" : "👁️"}</span>
</div>
```
