import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { updateProfile } from "../../src/api/auth";
import { useSettingsStore } from "../../src/stores/settingsStore";
import { useThemeStore, ThemeMode } from "../../src/stores/themeStore";
import { useColors } from "../../src/theme/useColors";
import type { Palette } from "../../src/theme/colors";

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "system", label: "跟随系统" },
  { mode: "light", label: "浅色" },
  { mode: "dark", label: "深色" },
];

export default function SettingsScreen() {
  const { user, logout, refreshUser } = useAuth();
  const { baseURL } = useSettingsStore();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [systemPrompt, setSystemPrompt] = useState(user?.systemPrompt ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim() || undefined,
        systemPrompt,
        apiKey: apiKey.trim() || undefined,
      });
      await refreshUser();
      Alert.alert("已保存");
    } catch (e: any) {
      Alert.alert("保存失败", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    Alert.alert("登出", "确定要登出吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "登出",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>设置</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text style={styles.saveText}>保存</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body}>
        {/* User info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>账号</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>用户名</Text>
            <Text style={styles.rowValue}>{user?.username}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.rowLabel}>显示名称</Text>
            <TextInput
              style={styles.fieldInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="可选"
            />
          </View>
        </View>

        {/* System prompt */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>系统提示词</Text>
          <TextInput
            style={styles.textarea}
            value={systemPrompt}
            onChangeText={setSystemPrompt}
            placeholder="自定义 AI 的角色和行为方式…"
            multiline
            numberOfLines={5}
          />
        </View>

        {/* API Key */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API Key（可选）</Text>
          <TextInput
            style={styles.fieldInputFull}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="填写后将覆盖服务器默认 Key"
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        {/* Server */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>连接</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>服务器地址</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {baseURL}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/server-setup")}
          >
            <Text style={styles.link}>修改服务器地址</Text>
          </TouchableOpacity>
        </View>

        {/* Appearance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>外观</Text>
          <View style={styles.segment}>
            {THEME_OPTIONS.map((opt) => {
              const active = themeMode === opt.mode;
              return (
                <TouchableOpacity
                  key={opt.mode}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                  onPress={() => setThemeMode(opt.mode)}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>登出</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    back: { color: c.primary, fontSize: 17, flex: 1 },
    title: { flex: 2, textAlign: "center", fontSize: 17, fontWeight: "600", color: c.text },
    saveText: { color: c.primary, fontSize: 17, flex: 1, textAlign: "right" },
    body: { flex: 1 },
    section: {
      backgroundColor: c.card,
      marginTop: 20,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: c.border,
      gap: 10,
    },
    sectionTitle: { fontSize: 13, color: c.textMuted, marginBottom: 4 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    rowLabel: { fontSize: 15, color: c.text },
    rowValue: { fontSize: 15, color: c.textMuted, maxWidth: "60%" },
    fieldRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    fieldInput: {
      flex: 1,
      fontSize: 15,
      textAlign: "right",
      color: c.text,
    },
    fieldInputFull: {
      fontSize: 15,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    textarea: {
      fontSize: 14,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 12,
      minHeight: 100,
      textAlignVertical: "top",
    },
    link: { color: c.primary, fontSize: 15 },
    segment: {
      flexDirection: "row",
      backgroundColor: c.inputBg,
      borderRadius: 8,
      padding: 3,
      gap: 3,
    },
    segmentItem: {
      flex: 1,
      paddingVertical: 8,
      alignItems: "center",
      borderRadius: 6,
    },
    segmentItemActive: { backgroundColor: c.primary },
    segmentText: { fontSize: 14, color: c.textMuted },
    segmentTextActive: { color: c.primaryText, fontWeight: "600" },
    logoutBtn: {
      margin: 20,
      backgroundColor: c.card,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.danger,
    },
    logoutText: { color: c.danger, fontSize: 16, fontWeight: "600" },
  });
