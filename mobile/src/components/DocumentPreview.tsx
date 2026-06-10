import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Markdown from "react-native-markdown-display";
import { previewFile, PreviewData } from "../api/files";
import { useColors } from "../theme/useColors";
import type { Palette } from "../theme/colors";

const CODE_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "Courier" });

function fmtSize(n: number) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

/** Full-screen modal that previews a local file by path (GET /api/files/preview). */
export function DocumentPreview({ path, onClose }: { path: string; onClose: () => void }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mdStyles = useMemo(() => makeMdStyles(colors), [colors]);
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    previewFile(path)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "无法打开文件");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  async function handleCopy() {
    if (!data) return;
    await Clipboard.setStringAsync(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.name} numberOfLines={1}>
              📄 {data?.name ?? "文档预览"}
            </Text>
            {data && (
              <Text style={styles.meta}>
                {fmtSize(data.size)}
                {data.truncated ? " · 已截断" : ""}
              </Text>
            )}
          </View>
          <View style={styles.actions}>
            {data && (
              <TouchableOpacity onPress={handleCopy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.actionText, copied && styles.actionActive]}>
                  {copied ? "✓ 已复制" : "复制"}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {data && (
          <Text style={styles.path} numberOfLines={1}>
            {data.path}
          </Text>
        )}

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {loading && <ActivityIndicator style={{ marginTop: 32 }} />}
          {!!error && <Text style={styles.error}>⚠️ {error}</Text>}
          {data && !loading && (
            data.type === "markdown" ? (
              <Markdown style={mdStyles}>{data.content}</Markdown>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <Text style={styles.code} selectable>
                  {data.content}
                </Text>
              </ScrollView>
            )
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.card },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: Platform.OS === "ios" ? 56 : 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 8,
    },
    titleWrap: { flex: 1 },
    name: { fontSize: 16, fontWeight: "600", color: c.text },
    meta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    actions: { flexDirection: "row", alignItems: "center", gap: 16 },
    actionText: { fontSize: 14, color: c.primary },
    actionActive: { color: "#4caf50" },
    close: { fontSize: 18, color: c.textMuted },
    path: {
      fontSize: 11,
      color: c.textMuted,
      paddingHorizontal: 16,
      paddingVertical: 6,
      fontFamily: CODE_FONT,
      backgroundColor: c.bg,
    },
    body: { flex: 1 },
    bodyContent: { padding: 16 },
    error: { color: c.danger, fontSize: 14 },
    code: { fontFamily: CODE_FONT, fontSize: 13, lineHeight: 19, color: c.text },
  });

const makeMdStyles = (c: Palette) => ({
  body: { fontSize: 15, lineHeight: 22, color: c.text },
  code_inline: {
    backgroundColor: c.inputBg,
    color: "#e0704a",
    fontFamily: CODE_FONT,
    fontSize: 13,
  },
  fence: {
    backgroundColor: "#1e1e1e",
    color: "#e0e0e0",
    fontFamily: CODE_FONT,
    fontSize: 13,
    padding: 12,
    borderRadius: 8,
  },
});
