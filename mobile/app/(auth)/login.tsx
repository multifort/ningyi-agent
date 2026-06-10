import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { useColors } from "../../src/theme/useColors";
import type { Palette } from "../../src/theme/colors";

export default function LoginScreen() {
  const { login } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      Alert.alert("提示", "请填写用户名和密码");
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
      router.replace("/(app)");
    } catch (e: any) {
      Alert.alert("登录失败", e.message ?? "请检查用户名和密码");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>宁翼智能助手</Text>
        <Text style={styles.subtitle}>登录你的账号</Text>

        <TextInput
          style={styles.input}
          placeholder="用户名"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="密码"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>登录</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
          <Text style={styles.link}>没有账号？点击注册</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingsLink}
          onPress={() => router.push("/(auth)/server-setup")}
        >
          <Text style={styles.settingsLinkText}>⚙ 服务器设置</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    inner: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 12,
    },
    title: { fontSize: 28, fontWeight: "700", textAlign: "center", marginBottom: 4, color: c.text },
    subtitle: { fontSize: 15, color: c.textMuted, textAlign: "center", marginBottom: 16 },
    input: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: c.text,
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 4,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: c.primaryText, fontSize: 16, fontWeight: "600" },
    link: { textAlign: "center", color: c.primary, marginTop: 8 },
    settingsLink: { alignItems: "center", marginTop: 24 },
    settingsLinkText: { color: c.textMuted, fontSize: 13 },
  });
