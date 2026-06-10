import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../src/auth/AuthContext";
import { useThemeStore } from "../src/stores/themeStore";
import { useColors, useIsDark } from "../src/theme/useColors";

const queryClient = new QueryClient();

function ThemedApp() {
  const loadTheme = useThemeStore((s) => s.loadTheme);
  const isDark = useIsDark();
  const colors = useColors();

  useEffect(() => {
    loadTheme();
  }, []);

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemedApp />
      </AuthProvider>
    </QueryClientProvider>
  );
}
