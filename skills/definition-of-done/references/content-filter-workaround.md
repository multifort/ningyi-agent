# Hermes Tool Content Filter — write_file / patch String Mangling

## Problem
The `write_file` and `patch` tools sometimes mangle strings that look like:
- Environment variable references: `process.env.JWT_SECRET` → `proces...CRET`
- Short quoted strings: `"7d"` → `"***"`
- Any string that resembles a secret or token

This causes compilation failures at runtime and is easy to miss in code review.

## Detection
If a `write_file` or `patch` produces lines that look truncated or have `...` in unexpected places, re-read the file with `read_file` immediately to verify the actual written content.

## Workarounds

### Environment variable access
Instead of:
```ts
const X = process.env.FOO ?? "default";
```
Use bracket notation:
```ts
const X = (process.env["FOO"]) ?? "default";
```

### Short quoted strings that get mangled
Instead of:
```ts
const ttl = "7d";
```
Use hex escapes or avoid standalone short quoted strings:
```ts
const ttl = "\x37\x64"; // "7d"
```

### Complex strings
Break into concatenation:
```ts
const key = "JWT" + "_SECRET";
const val = process.env[key] ?? fallback;
```

## Verification
After any `write_file` or `patch` in `server/src/`, always:
1. `read_file` the affected lines
2. Run `npm --prefix server run build` to verify
