import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  loadTheme: () => Promise<void>;
}

const THEME_KEY = "hermes_theme_mode";

export const useThemeStore = create<ThemeState>((set) => ({
  mode: "system",

  setMode: async (mode) => {
    set({ mode });
    try {
      await SecureStore.setItemAsync(THEME_KEY, mode);
    } catch {}
  },

  loadTheme: async () => {
    try {
      const stored = (await SecureStore.getItemAsync(THEME_KEY)) as ThemeMode | null;
      if (stored === "light" || stored === "dark" || stored === "system") {
        set({ mode: stored });
      }
    } catch {}
  },
}));
