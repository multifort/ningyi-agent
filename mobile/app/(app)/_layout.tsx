import { Stack } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";

export default function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="memory/index" />
      <Stack.Screen name="skills/index" />
      <Stack.Screen name="scheduler/index" />
    </Stack>
  );
}
