import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
  Share,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMessages,
  renameConversation,
  createConversation,
  shareConversation,
  Message,
} from "../../../src/api/conversations";
import { useChatStore } from "../../../src/stores/chatStore";
import { streamChat, SSEEvent } from "../../../src/lib/sse";
import { listSkills, invokeSkill } from "../../../src/api/skills";
import { MessageBubble } from "../../../src/components/MessageBubble";
import { SlashMenu, SlashItem } from "../../../src/components/SlashMenu";
import { useSettingsStore } from "../../../src/stores/settingsStore";
import { useColors } from "../../../src/theme/useColors";
import type { Palette } from "../../../src/theme/colors";

const ASSISTANT_TEMP_ID = "__streaming__";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const flatListRef = useRef<FlatList>(null);
  const abortRef = useRef<AbortController | null>(null);
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const {
    messages,
    streaming,
    mode,
    setConversation,
    setMessages,
    addMessage,
    appendToken,
    appendReasoning,
    toolStart,
    toolEnd,
    setStreaming,
    setMode,
    finalizeMessage,
  } = useChatStore();

  const [input, setInput] = useState("");

  // Skills for slash commands
  const { data: skills = [] } = useQuery({ queryKey: ["skills"], queryFn: listSkills });
  const showSlash = /^\/[^\s]*$/.test(input);

  const { data: serverMessages } = useQuery({
    queryKey: ["messages", id],
    queryFn: () => getMessages(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (id) {
      setConversation(id);
    }
  }, [id]);

  useEffect(() => {
    if (serverMessages) {
      setMessages(serverMessages);
    }
  }, [serverMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // Shared streaming runner: sets up the assistant placeholder + streaming
  // state, runs `run` (which wires our onEvent into chat OR skill SSE), then
  // resolves the placeholder. Used by both normal chat and slash-skill invoke.
  const runStream = useCallback(
    async (run: (onEvent: (evt: SSEEvent) => void, signal: AbortSignal) => Promise<void>) => {
      addMessage({ id: ASSISTANT_TEMP_ID, role: "assistant", content: "" });
      setStreaming(true);
      abortRef.current = new AbortController();

      const onEvent = (evt: SSEEvent) => {
        switch (evt.type) {
          case "token":
            appendToken(ASSISTANT_TEMP_ID, evt.content);
            flatListRef.current?.scrollToEnd({ animated: false });
            break;
          case "reasoning":
            appendReasoning(ASSISTANT_TEMP_ID, evt.content);
            break;
          case "tool_start":
            toolStart(ASSISTANT_TEMP_ID, evt.stepId, evt.toolName, evt.input);
            break;
          case "tool_end":
            toolEnd(ASSISTANT_TEMP_ID, evt.stepId, evt.output, evt.durationMs);
            break;
          case "done":
            finalizeMessage(ASSISTANT_TEMP_ID, evt.messageId ?? `asst-${Date.now()}`);
            break;
          case "error":
            Alert.alert("出错了", evt.message ?? "未知错误");
            break;
        }
      };

      try {
        await run(onEvent, abortRef.current.signal);
        // Re-fetch conversation list to update titles
        qc.invalidateQueries({ queryKey: ["conversations"] });
      } catch (e: any) {
        // User-initiated stop surfaces differently across runtimes:
        // - web/standard fetch → AbortError
        // - expo/fetch (iOS native) → Expo.FetchRequestCanceledException
        const msg = String(e?.message ?? "");
        const isCanceled =
          e?.name === "AbortError" ||
          /abort|cancel/i.test(e?.name ?? "") ||
          /abort|cancel/i.test(msg);
        if (!isCanceled) {
          Alert.alert("发送失败", e.message ?? "请稍后重试");
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        // Resolve the streaming placeholder so it never stays stuck on
        // "正在思考". If nothing was produced, drop it; otherwise finalize it.
        const msgs = useChatStore.getState().messages;
        const last = msgs[msgs.length - 1];
        if (last?.id === ASSISTANT_TEMP_ID) {
          const empty =
            last.content.trim().length === 0 && !(last.toolCalls && last.toolCalls.length > 0);
          if (empty) {
            setMessages(msgs.slice(0, -1));
          } else {
            finalizeMessage(ASSISTANT_TEMP_ID, `asst-${Date.now()}`);
          }
        }
      }
    },
    [],
  );

  const doStream = useCallback(
    (apiMessages: Array<{ role: string; content: string }>) =>
      runStream((onEvent, signal) =>
        streamChat({ conversationId: id, messages: apiMessages, mode, signal, onEvent }),
      ),
    [id, mode, runStream],
  );

  const doSkillStream = useCallback(
    (skillName: string, skillInput: string) =>
      runStream((onEvent, signal) =>
        invokeSkill({ skillName, input: skillInput, conversationId: id, signal, onEvent }),
      ),
    [id, runStream],
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    // Slash skill: "/name args" where `name` is a known skill → invoke skill.
    const skillMatch = /^\/(\S+)\s+([\s\S]+)$/.exec(text);
    if (skillMatch && skills.some((s) => s.name === skillMatch[1])) {
      const [, name, arg] = skillMatch;
      setInput("");
      addMessage({ id: `user-${Date.now()}`, role: "user", content: text });
      await doSkillStream(name, arg.trim());
      return;
    }

    setInput("");
    addMessage({ id: `user-${Date.now()}`, role: "user", content: text });

    const apiMessages = useChatStore
      .getState()
      .messages.filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    await doStream(apiMessages);
  }, [input, streaming, doStream, doSkillStream, skills]);

  const handleEdit = useCallback((text: string) => {
    setInput(text);
  }, []);

  const handleRegenerate = useCallback(
    (messageId: string) => {
      if (streaming) return;
      const msgs = useChatStore.getState().messages;
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx === -1 || msgs[idx].role !== "assistant") return;

      const apiMessages = msgs
        .slice(0, idx)
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));
      if (!apiMessages.some((m) => m.role === "user")) return;

      setMessages(msgs.slice(0, idx));
      doStream(apiMessages);
    },
    [streaming, doStream, setMessages],
  );

  function handleStop() {
    abortRef.current?.abort();
    abortRef.current = null;
    // Reset UI immediately — don't wait for the (possibly delayed) request
    // teardown. Agent requests can hang on the first byte, so abort() may not
    // reject the pending read right away.
    setStreaming(false);
    const msgs = useChatStore.getState().messages;
    const last = msgs[msgs.length - 1];
    if (last?.id === ASSISTANT_TEMP_ID) {
      const empty =
        last.content.trim().length === 0 && !(last.toolCalls && last.toolCalls.length > 0);
      if (empty) {
        setMessages(msgs.slice(0, -1));
      } else {
        finalizeMessage(ASSISTANT_TEMP_ID, `asst-${Date.now()}`);
      }
    }
  }

  async function handleShareCurrent() {
    try {
      const info = await shareConversation(id);
      const base = useSettingsStore.getState().baseURL.replace(/\/$/, "");
      const fullUrl = `${base}${info.url}`;
      await Share.share({ message: fullUrl, url: fullUrl });
    } catch {
      Alert.alert("分享失败", "请稍后重试");
    }
  }

  const handleSlashSelect = useCallback((item: SlashItem) => {
    if (item.kind === "builtin") {
      if (item.cmd === "/new") {
        setInput("");
        createConversation().then((c) => router.replace(`/(app)/chat/${c.id}`));
      } else if (item.cmd === "/clear") {
        setInput("");
        setMessages([]);
      } else if (item.cmd === "/share") {
        setInput("");
        handleShareCurrent();
      }
    } else if (item.skillName) {
      setInput(`/${item.skillName} `);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        streaming={streaming}
        onEdit={item.role === "user" ? handleEdit : undefined}
        onRegenerate={
          item.role === "assistant" ? () => handleRegenerate(item.id) : undefined
        }
      />
    ),
    [streaming, handleEdit, handleRegenerate],
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {/* Centered title (rendered first = bottom layer, long-press to rename) */}
        <TouchableOpacity
          style={styles.titleCenter}
          activeOpacity={1}
          onLongPress={() => {
            Alert.prompt(
              "重命名对话",
              "",
              (title) => {
                if (title?.trim()) {
                  renameConversation(id, title.trim()).then(() =>
                    qc.invalidateQueries({ queryKey: ["conversations"] }),
                  );
                }
              },
              "plain-text",
            );
          }}
        >
          <Text style={styles.headerTitle} numberOfLines={1}>
            对话
          </Text>
        </TouchableOpacity>

        {/* Left: back + history list */}
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.historyBtn} onPress={() => router.back()}>
          <Text style={styles.historyIcon}>☰</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {/* Right: mode toggle */}
        <TouchableOpacity
          onPress={() => setMode(mode === "chat" ? "agent" : "chat")}
          style={[styles.modeBtn, mode === "agent" && styles.modeBtnActive]}
        >
          <Text style={[styles.modeBtnText, mode === "agent" && styles.modeBtnTextActive]}>
            {mode === "agent" ? "Agent" : "Chat"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
      />

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {showSlash && (
          <SlashMenu query={input} skills={skills} onSelect={handleSlashSelect} />
        )}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="输入消息…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            returnKeyType="default"
          />
          {streaming ? (
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
              <Text style={styles.stopBtnText}>■</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim()}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 8,
    },
    back: { fontSize: 28, color: c.primary, lineHeight: 34 },
    historyBtn: { paddingHorizontal: 6, justifyContent: "center" },
    historyIcon: { fontSize: 20, color: c.primary },
    titleCenter: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { fontSize: 16, fontWeight: "600", color: c.text },
    modeBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primary,
    },
    modeBtnActive: { backgroundColor: c.primary },
    modeBtnText: { fontSize: 13, color: c.primary },
    modeBtnTextActive: { color: c.primaryText },
    messageList: { paddingVertical: 8 },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      padding: 8,
      backgroundColor: c.card,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 8,
    },
    input: {
      flex: 1,
      backgroundColor: c.inputBg,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      maxHeight: 120,
      color: c.text,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnDisabled: { backgroundColor: c.textMuted },
    sendBtnText: { color: c.primaryText, fontSize: 20, lineHeight: 22 },
    stopBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.danger,
      alignItems: "center",
      justifyContent: "center",
    },
    stopBtnText: { color: "#fff", fontSize: 14 },
  });
