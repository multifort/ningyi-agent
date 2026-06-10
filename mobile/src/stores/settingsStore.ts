import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

interface SettingsState {
  baseURL: string;
  setBaseURL: (url: string) => Promise<void>;
  loadSettings: () => Promise<void>;
}

const BASE_URL_KEY = "hermes_base_url";
const DEFAULT_URL = "http://localhost:8787";

export const useSettingsStore = create<SettingsState>((set) => ({
  baseURL: DEFAULT_URL,

  setBaseURL: async (url: string) => {
    const trimmed = url.replace(/\/$/, "");
    await SecureStore.setItemAsync(BASE_URL_KEY, trimmed);
    set({ baseURL: trimmed });
  },

  loadSettings: async () => {
    const stored = await SecureStore.getItemAsync(BASE_URL_KEY);
    if (stored) set({ baseURL: stored });
  },
}));
