import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listMemories, addMemory, updateMemory, deleteMemory, Memory } from "../../../src/api/memory";
import { useColors } from "../../../src/theme/useColors";
import type { Palette } from "../../../src/theme/colors";

export default function MemoryScreen() {
  const qc = useQueryClient();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Memory | null>(null);
  const [key, setKey] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: memories = [], isLoading, refetch } = useQuery({
    queryKey: ["memories"],
    queryFn: listMemories,
  });

  const deleteMut = useMutation({
    mutationFn: deleteMemory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memories"] }),
  });

  function openAdd() {
    setEditTarget(null);
    setKey("");
    setContent("");
    setModalVisible(true);
  }

  function openEdit(mem: Memory) {
    setEditTarget(mem);
    setKey(mem.key);
    setContent(mem.content);
    setModalVisible(true);
  }

  async function handleSave() {
    if (!key.trim() || !content.trim()) {
      Alert.alert("提示", "标题和内容不能为空");
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await updateMemory(editTarget.id, { key: key.trim(), content: content.trim() });
      } else {
        await addMemory(key.trim(), content.trim());
      }
      await qc.invalidateQueries({ queryKey: ["memories"] });
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert("保存失败", e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id: string, memKey: string) {
    Alert.alert("删除记忆", `确定删除「${memKey}」？`, [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => deleteMut.mutate(id) },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>记忆管理</Text>
        <TouchableOpacity onPress={openAdd}>
          <Text style={styles.addBtn}>＋</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={memories}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openEdit(item)}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardKey} numberOfLines={1}>{item.key}</Text>
              <View style={styles.cardActions}>
                <Text style={styles.sourceTag}>{item.source}</Text>
                <TouchableOpacity onPress={() => handleDelete(item.id, item.key)}>
                  <Text style={styles.deleteBtn}>删除</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.cardContent} numberOfLines={3}>{item.content}</Text>
            <Text style={styles.cardDate}>
              {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>暂无记忆条目</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openAdd}>
              <Text style={styles.emptyBtnText}>添加记忆</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={memories.length === 0 ? { flex: 1 } : { paddingBottom: 16 }}
      />

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.cancel}>取消</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editTarget ? "编辑记忆" : "添加记忆"}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" /> : <Text style={styles.saveText}>保存</Text>}
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>标题（Key）</Text>
              <TextInput
                style={styles.fieldInput}
                value={key}
                onChangeText={setKey}
                placeholder="例：用户的偏好"
                maxLength={100}
              />
              <Text style={styles.fieldLabel}>内容</Text>
              <TextInput
                style={[styles.fieldInput, styles.textarea]}
                value={content}
                onChangeText={setContent}
                placeholder="记忆的具体内容…"
                multiline
                maxLength={4000}
                textAlignVertical="top"
              />
            </View>
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
    addBtn: { color: c.primary, fontSize: 24, flex: 1, textAlign: "right", lineHeight: 28 },
    card: {
      backgroundColor: c.card,
      marginHorizontal: 12,
      marginTop: 10,
      borderRadius: 12,
      padding: 14,
      gap: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    cardKey: { fontWeight: "600", fontSize: 15, flex: 1, color: c.text },
    cardActions: { flexDirection: "row", gap: 12, alignItems: "center" },
    sourceTag: {
      fontSize: 11,
      color: c.textMuted,
      backgroundColor: c.inputBg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    deleteBtn: { color: c.danger, fontSize: 13 },
    cardContent: { color: c.textMuted, fontSize: 14, lineHeight: 20 },
    cardDate: { color: c.textMuted, fontSize: 12 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    emptyText: { color: c.textMuted, fontSize: 16 },
    emptyBtn: { backgroundColor: c.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
    emptyBtnText: { color: c.primaryText, fontWeight: "600" },
    modal: { flex: 1, backgroundColor: c.bg },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.card,
    },
    cancel: { color: c.danger, fontSize: 16, flex: 1 },
    modalTitle: { flex: 2, textAlign: "center", fontSize: 17, fontWeight: "600", color: c.text },
    saveText: { color: c.primary, fontSize: 16, flex: 1, textAlign: "right" },
    modalBody: { padding: 16, gap: 8 },
    fieldLabel: { fontWeight: "600", fontSize: 14, color: c.text },
    fieldInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
      backgroundColor: c.card,
    },
    textarea: { minHeight: 160, textAlignVertical: "top" },
  });
