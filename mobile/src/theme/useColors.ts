import { useColorScheme } from "react-native";
import { useThemeStore } from "../stores/themeStore";
import { lightColors, darkColors, Palette } from "./colors";

/** Returns the active palette based on the user's theme mode + system scheme. */
export function useColors(): Palette {
  const mode = useThemeStore((s) => s.mode);
  const system = useColorScheme(); // "light" | "dark" | null
  const isDark = mode === "system" ? system === "dark" : mode === "dark";
  return isDark ? darkColors : lightColors;
}

/** Convenience: whether dark mode is currently active. */
export function useIsDark(): boolean {
  const mode = useThemeStore((s) => s.mode);
  const system = useColorScheme();
  return mode === "system" ? system === "dark" : mode === "dark";
}
