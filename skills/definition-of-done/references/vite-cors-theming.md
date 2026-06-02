# Vite Dev Server IP Access

## Problem
Vite dev server defaults to `localhost` only. Cannot access via `127.0.0.1` or machine IP.

## Fix
Set `host: "0.0.0.0"` in `vite.config.ts`:
```typescript
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } },
  },
});
```

## Backend CORS for multiple origins
Use a dynamic origin callback in Express to allow local IPs:
```typescript
cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):5173$/.test(origin))
      return callback(null, true);
    callback(new Error("Not allowed"));
  },
});
```

## CSS Theming with data-theme
Use `data-theme` attribute on `<html>` and CSS custom properties:
```css
:root { --bg: #0d0d0d; --text: #ececec; }
[data-theme="light"] { --bg: #ffffff; --text: #1a1a1a; }
body { background: var(--bg); color: var(--text); }
```
Toggle via JS: `document.documentElement.setAttribute("data-theme", "light")`.
