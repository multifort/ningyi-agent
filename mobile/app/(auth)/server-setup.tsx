import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSettingsStore } from "../../src/stores/settingsStore";
import { checkHealth } from "../../src/api/auth";
import { useColors } from "../../src/theme/useColors";
import type { Palette } from "../../src/theme/colors";

export default function ServerSetupScreen() {
  const { baseURL, setBaseURL } = useSettingsStore();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [url, setUrl] = useState(baseURL);
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    const trimmed = url.replace(/\/$/, "");
    setTesting(true);
    try {
      const ok = await checkHealth(trimmed);
      if (ok) {
        Alert.alert("连接成功", "服务器在线！");
      } else {
        Alert.alert("连接失败", "服务器无响应，请检查地址和 Tailscale 是否开启");
      }
    } catch {
      Alert.alert("连接失败", "无法连接服务器，请检查网络");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    await setBaseURL(url);
    router.back();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>服务器设置</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>服务器地址</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="http://my-mac.tailXXXX.ts.net:8787"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.hint}>
          通过 Tailscale MagicDNS 主机名连接，格式：{"\n"}
          http://&lt;主机名&gt;.&lt;tailnet&gt;.ts.net:8787
        </Text>

        <TouchableOpacity
          style={[styles.testBtn, testing && styles.btnDisabled]}
          onPress={handleTest}
          disabled={testing}
        >
          {testing ? (
            <ActivityIndicator color="#007AFF" />
          ) : (
            <Text style={styles.testBtnText}>测试连接</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>保存</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    back: { fontSize: 18, color: c.primary },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    body: { padding: 20, gap: 12 },
    label: { fontWeight: "600", fontSize: 14, color: c.text },
    input: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      color: c.text,
    },
    hint: { color: c.textMuted, fontSize: 13, lineHeight: 20 },
    testBtn: {
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
    },
    testBtnText: { color: c.primary, fontSize: 16 },
    saveBtn: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 4,
    },
    saveBtnText: { color: c.primaryText, fontSize: 16, fontWeight: "600" },
    btnDisabled: { opacity: 0.6 },
  });
