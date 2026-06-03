import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist is build output; public/ holds static assets (incl. a service worker
  // written with TS-style annotations in a .js file) — neither is lintable source.
  globalIgnores(['dist', 'public']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Experimental React-Compiler rules (bundled in react-hooks v6 recommended).
      // They flag canonical hand-written patterns — fetch-on-mount and
      // prop-derived state via setState-in-effect — that are correct without the
      // compiler. The battle-tested rules-of-hooks/exhaustive-deps stay on, as
      // does purity (which catches real impure-render issues like Math.random).
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      // Fast-Refresh-only hint: a context file exporting its provider component
      // alongside its hook (useAuth/useTheme) is the universal React pattern.
      'react-refresh/only-export-components': 'off',
    },
  },
])
