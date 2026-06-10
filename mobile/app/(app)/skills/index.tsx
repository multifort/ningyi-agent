import React, { useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { listSkills, invokeSkill, Skill } from "../../../src/api/skills";
import { useColors } from "../../../src/theme/useColors";
import type { Palette } from "../../../src/theme/colors";

export default function SkillsScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills,
  });

  function openSkill(skill: Skill) {
    setSelected(skill);
    setInput("");
    setOutput("");
  }

  async function handleInvoke() {
    if (!selected || !input.trim() || running) return;
    setOutput("");
    setRunning(true);
    abortRef.current = new AbortController();
    try {
      await invokeSkill({
        skillName: selected.name,
        input: input.trim(),
        signal: abortRef.current.signal,
        onEvent: (evt) => {
          if (evt.type === "token") {
            setOutput((prev) => prev + evt.content);
          } else if (evt.type === "error") {
            Alert.alert("执行失败", evt.message);
          }
        },
      });
    } catch (e: any) {
      if (e.name !== "AbortError") Alert.alert("执行失败", e.message);
    } finally {
      setRunning(false);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>技能</Text>
        <View style={{ flex: 1 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={skills}
          keyExtractor={(s) => s.name}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => openSkill(item)}>
              <Text style={styles.cardName}>{item.name}</Text>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
              ) : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>暂无可用技能</Text>
            </View>
          }
          contentContainerStyle={skills.length === 0 ? { flex: 1 } : { paddingBottom: 16 }}
        />
      )}

      {/* Invoke Modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Text style={styles.cancel}>关闭</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle} numberOfLines={1}>{selected?.name}</Text>
              {running ? (
                <TouchableOpacity onPress={handleStop}>
                  <Text style={styles.stopText}>停止</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleInvoke} disabled={!input.trim()}>
                  <Text style={[styles.runText, !input.trim() && styles.disabled]}>运行</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>输入</Text>
              <TextInput
                style={[styles.fieldInput, styles.textarea]}
                value={input}
                onChangeText={setInput}
                placeholder="技能的输入内容…"
                multiline
                maxLength={8000}
                textAlignVertical="top"
              />

              {(output || running) ? (
                <>
                  <View style={styles.outputHeader}>
                    <Text style={styles.fieldLabel}>输出</Text>
                    {running && <ActivityIndicator size="small" style={{ marginLeft: 8 }} />}
                  </View>
                  <View style={styles.outputBox}>
                    <Text style={styles.outputText}>{output || "正在执行…"}</Text>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
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
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    emptyText: { color: c.textMuted, fontSize: 16 },
    card: {
      backgroundColor: c.card,
      marginHorizontal: 12,
      marginTop: 10,
      borderRadius: 12,
      padding: 14,
      gap: 4,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardName: { fontSize: 16, fontWeight: "600", color: c.primary },
    cardDesc: { fontSize: 13, color: c.textMuted, lineHeight: 18 },
    modal: { flex: 1, backgroundColor: c.bg },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    cancel: { color: c.textMuted, fontSize: 16, flex: 1 },
    modalTitle: { flex: 2, textAlign: "center", fontSize: 16, fontWeight: "600", color: c.text },
    runText: { color: c.primary, fontSize: 16, flex: 1, textAlign: "right" },
    stopText: { color: c.danger, fontSize: 16, flex: 1, textAlign: "right" },
    disabled: { opacity: 0.4 },
    modalBody: { flex: 1, padding: 16 },
    fieldLabel: { fontWeight: "600", fontSize: 14, color: c.text, marginBottom: 6 },
    fieldInput: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      marginBottom: 16,
      color: c.text,
    },
    textarea: { minHeight: 120, textAlignVertical: "top" },
    outputHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    outputBox: {
      backgroundColor: "#1e1e1e",
      borderRadius: 10,
      padding: 14,
      marginBottom: 24,
    },
    outputText: { color: "#e0e0e0", fontSize: 14, lineHeight: 22, fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace" },
  });
