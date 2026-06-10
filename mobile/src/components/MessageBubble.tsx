import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated, ScrollView } from "react-native";
import * as Clipboard from "expo-clipboard";
import Markdown from "react-native-markdown-display";
import { Message, ToolCall } from "../api/conversations";
import { extractFilePath } from "../api/files";
import { DocumentPreview } from "./DocumentPreview";
import { useColors } from "../theme/useColors";
import type { Palette } from "../theme/colors";

/* Animated "thinking" indicator shown while the assistant has no content yet. */
function ThinkingDots() {
  const styles = useStyles();
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];

  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(d, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View style={styles.thinkingRow}>
      <Text style={styles.thinkingText}>正在思考</Text>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.thinkingDot, { opacity: d }]} />
      ))}
    </View>
  );
}

interface Props {
  message: Message;
  streaming?: boolean;
  onEdit?: (text: string) => void;
  onRegenerate?: () => void;
}

const HITSLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const CODE_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "Courier" });

/** Themed styles hook shared by all sub-components in this file. */
function useStyles() {
  const c = useColors();
  return useMemo(() => makeStyles(c), [c]);
}

/* Expandable tool-call card: tap to view the command/script (input) and output. */
function ToolCallItem({ tc }: { tc: ToolCall }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const detail = (tc.input ?? "").trim();
  const output = (tc.output ?? "").trim();
  const hasDetail = detail.length > 0 || output.length > 0;
  const filePath = extractFilePath(tc.input);

  return (
    <View style={styles.toolCard}>
      <TouchableOpacity
        activeOpacity={hasDetail ? 0.7 : 1}
        onPress={() => hasDetail && setOpen((o) => !o)}
      >
        <Text style={styles.toolName}>
          {tc.status === "running" ? "⏳" : "✓"} {tc.toolName}
          {hasDetail ? (open ? "  ▾" : "  ▸") : ""}
        </Text>
      </TouchableOpacity>
      {filePath && (
        <TouchableOpacity onPress={() => setPreviewPath(filePath)} style={styles.previewBtn}>
          <Text style={styles.previewBtnText}>👁 预览 {filePath.split("/").pop()}</Text>
        </TouchableOpacity>
      )}
      {open && detail.length > 0 && (
        <Text style={styles.toolDetail} selectable>
          {detail}
        </Text>
      )}
      {open && output.length > 0 && (
        <Text style={styles.toolOutput} selectable>
          {output}
        </Text>
      )}
      {previewPath && (
        <DocumentPreview path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
    </View>
  );
}

/* Fenced code block with language label + copy button + horizontal scroll. */
function CodeBlock({ content, language }: { content: string; language?: string }) {
  const styles = useStyles();
  const [copied, setCopied] = useState(false);
  const code = content.replace(/\n$/, "");

  async function copy() {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLang}>{(language || "code").toLowerCase()}</Text>
        <TouchableOpacity onPress={copy} hitSlop={HITSLOP}>
          <Text style={[styles.codeCopyBtn, copied && styles.codeCopyBtnActive]}>
            {copied ? "✓ 已复制" : "⎘ 复制"}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.codeScroll}>
        <Text style={styles.codeText} selectable>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

export function MessageBubble({ message, streaming, onEdit, onRegenerate }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const markdownStyles = useMemo(() => makeMarkdownStyles(colors), [colors]);
  const isUser = message.role === "user";
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isStreamingPlaceholder = message.id === "__streaming__";

  async function handleCopy() {
    await Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {!isUser && (
        <View style={styles.assistantAvatar}>
          <Text style={styles.avatarText}>AI</Text>
        </View>
      )}
      <View style={styles.bubbleWrap}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          {/* Reasoning (thinking) */}
          {message.reasoning && (
            <TouchableOpacity
              style={styles.reasoningToggle}
              onPress={() => setReasoningOpen((v) => !v)}
            >
              <Text style={styles.reasoningToggleText}>
                {reasoningOpen ? "▾ 隐藏思考过程" : "▸ 查看思考过程"}
              </Text>
            </TouchableOpacity>
          )}
          {message.reasoning && reasoningOpen && (
            <View style={styles.reasoningBox}>
              <Text style={styles.reasoningText}>{message.reasoning}</Text>
            </View>
          )}

          {/* Tool calls */}
          {message.toolCalls?.map((tc) => (
            <ToolCallItem key={tc.stepId} tc={tc} />
          ))}

          {/* Content */}
          {isUser ? (
            <Text style={styles.userText}>{message.content}</Text>
          ) : message.content.trim().length === 0 ? (
            <ThinkingDots />
          ) : (
            <Markdown style={markdownStyles} rules={markdownRules}>
              {message.content}
            </Markdown>
          )}
        </View>

        {/* Action bar — minimal icons */}
        {!isStreamingPlaceholder && message.content.trim().length > 0 && (
          <View style={[styles.actions, isUser ? styles.actionsUser : styles.actionsAssistant]}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} hitSlop={HITSLOP}>
              <Text style={[styles.icon, copied && styles.iconActive]}>
                {copied ? "✓" : "⎘"}
              </Text>
            </TouchableOpacity>
            {isUser && onEdit && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onEdit(message.content)}
                hitSlop={HITSLOP}
              >
                <Text style={styles.icon}>✎</Text>
              </TouchableOpacity>
            )}
            {!isUser && onRegenerate && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={onRegenerate}
                disabled={streaming}
                hitSlop={HITSLOP}
              >
                <Text style={[styles.icon, streaming && styles.iconDisabled]}>↻</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: "row", marginVertical: 4, paddingHorizontal: 12 },
    rowUser: { justifyContent: "flex-end" },
    rowAssistant: { justifyContent: "flex-start" },
    assistantAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
      alignSelf: "flex-end",
    },
    avatarText: { color: c.primaryText, fontSize: 11, fontWeight: "700" },
    bubbleWrap: { maxWidth: "82%" },
    bubble: {
      borderRadius: 16,
      padding: 12,
    },
    bubbleUser: {
      backgroundColor: c.bubbleUser,
    },
    bubbleAssistant: {
      backgroundColor: c.bubbleAssistant,
      borderWidth: 1,
      borderColor: c.bubbleAssistantBorder,
    },
    userText: { color: c.bubbleUserText, fontSize: 15, lineHeight: 22 },
    reasoningToggle: { marginBottom: 6 },
    reasoningToggleText: { color: c.primary, fontSize: 13 },
    reasoningBox: {
      backgroundColor: c.inputBg,
      borderRadius: 8,
      padding: 8,
      marginBottom: 8,
    },
    reasoningText: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    toolCard: {
      backgroundColor: c.inputBg,
      borderRadius: 8,
      padding: 8,
      marginBottom: 8,
    },
    thinkingRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 2 },
    thinkingText: { fontSize: 14, color: c.textMuted, marginRight: 2 },
    thinkingDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.textMuted },
    toolName: { fontWeight: "600", fontSize: 13, color: c.text },
    previewBtn: {
      marginTop: 6,
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: c.inputBg,
      borderRadius: 6,
    },
    previewBtnText: { color: c.primary, fontSize: 12 },
    toolDetail: {
      fontSize: 12,
      color: c.text,
      marginTop: 6,
      fontFamily: CODE_FONT,
      backgroundColor: c.inputBg,
      borderRadius: 6,
      padding: 8,
    },
    toolOutput: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 6,
      fontFamily: CODE_FONT,
      backgroundColor: c.inputBg,
      borderRadius: 6,
      padding: 8,
    },
    // Code blocks stay dark in both themes (matches web)
    codeBlock: {
      backgroundColor: "#1e1e1e",
      borderRadius: 8,
      marginVertical: 6,
      overflow: "hidden",
    },
    codeHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: "#2a2a2a",
    },
    codeLang: { color: "#9a9a9a", fontSize: 11, fontFamily: CODE_FONT },
    codeCopyBtn: { color: "#9a9a9a", fontSize: 12 },
    codeCopyBtnActive: { color: "#4caf50" },
    codeScroll: { padding: 12 },
    codeText: {
      color: "#e0e0e0",
      fontFamily: CODE_FONT,
      fontSize: 13,
      lineHeight: 19,
    },
    actions: {
      flexDirection: "row",
      marginTop: 6,
      gap: 18,
      paddingHorizontal: 4,
    },
    actionsUser: { justifyContent: "flex-end" },
    actionsAssistant: { justifyContent: "flex-start" },
    actionBtn: { paddingVertical: 2 },
    icon: { fontSize: 17, color: c.textMuted },
    iconActive: { color: c.primary },
    iconDisabled: { color: c.border },
  });

const makeMarkdownStyles = (c: Palette) => ({
  body: { fontSize: 15, lineHeight: 22, color: c.text },
  // Inline `code`
  code_inline: {
    backgroundColor: c.inputBg,
    color: "#e0704a",
    fontFamily: CODE_FONT,
    fontSize: 13,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  // Fenced ``` code blocks stay dark (rendered via CodeBlock rule anyway)
  fence: {
    backgroundColor: "#1e1e1e",
    color: "#e0e0e0",
    fontFamily: CODE_FONT,
    fontSize: 13,
    lineHeight: 19,
    padding: 12,
    borderRadius: 8,
  },
  code_block: {
    backgroundColor: "#1e1e1e",
    color: "#e0e0e0",
    fontFamily: CODE_FONT,
    fontSize: 13,
    lineHeight: 19,
    padding: 12,
    borderRadius: 8,
  },
});

// Custom renderers: fenced/indented code blocks get a copy button + h-scroll.
const markdownRules = {
  fence: (node: { key: string; content: string; sourceInfo?: string }) => (
    <CodeBlock key={node.key} content={node.content} language={node.sourceInfo} />
  ),
  code_block: (node: { key: string; content: string }) => (
    <CodeBlock key={node.key} content={node.content} />
  ),
};
