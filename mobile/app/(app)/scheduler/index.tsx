import React, { useState, useMemo } from "react";
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
  Alert,
  Switch,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useColors } from "../../../src/theme/useColors";
import type { Palette } from "../../../src/theme/colors";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  ScheduledTask,
} from "../../../src/api/scheduler";

const CRON_PRESETS = [
  { label: "每天 9:00", value: "0 9 * * *" },
  { label: "每天 18:00", value: "0 18 * * *" },
  { label: "每小时", value: "0 * * * *" },
  { label: "每周一 9:00", value: "0 9 * * 1" },
  { label: "每月 1 号", value: "0 9 1 * *" },
];

export default function SchedulerScreen() {
  const qc = useQueryClient();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduledTask | null>(null);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 9 * * *");
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ["tasks"],
    queryFn: listTasks,
  });

  const deleteMut = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateTask(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  function openAdd() {
    setEditTarget(null);
    setName("");
    setSchedule("0 9 * * *");
    setPrompt("");
    setModalVisible(true);
  }

  function openEdit(task: ScheduledTask) {
    setEditTarget(task);
    setName(task.name);
    setSchedule(task.schedule);
    setPrompt(task.prompt);
    setModalVisible(true);
  }

  async function handleSave() {
    if (!name.trim() || !schedule.trim() || !prompt.trim()) {
      Alert.alert("提示", "请填写任务名称、执行计划和内容");
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await updateTask(editTarget.id, {
          name: name.trim(),
          schedule: schedule.trim(),
          prompt: prompt.trim(),
        });
      } else {
        await createTask({ name: name.trim(), schedule: schedule.trim(), prompt: prompt.trim() });
      }
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert("保存失败", e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id: string, taskName: string) {
    Alert.alert("删除任务", `确定删除「${taskName}」？`, [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => deleteMut.mutate(id) },
    ]);
  }

  function formatNext(dateStr: string | null): string {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>定时任务</Text>
        <TouchableOpacity onPress={openAdd}>
          <Text style={styles.addBtn}>＋</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openEdit(item)}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cardCron}>{item.schedule}</Text>
              </View>
              <Switch
                value={item.enabled}
                onValueChange={(v) => toggleMut.mutate({ id: item.id, enabled: v })}
              />
            </View>
            <Text style={styles.cardPrompt} numberOfLines={2}>{item.prompt}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>下次执行：{formatNext(item.nextRunAt)}</Text>
              <TouchableOpacity onPress={() => handleDelete(item.id, item.name)}>
                <Text style={styles.deleteBtn}>删除</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>暂无定时任务</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openAdd}>
              <Text style={styles.emptyBtnText}>创建任务</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={tasks.length === 0 ? { flex: 1 } : { paddingBottom: 16 }}
      />

      {/* Create / Edit Modal */}
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
              <Text style={styles.modalTitle}>{editTarget ? "编辑任务" : "创建任务"}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" /> : <Text style={styles.saveText}>保存</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>任务名称</Text>
              <TextInput
                style={styles.fieldInput}
                value={name}
                onChangeText={setName}
                placeholder="例：每日早报"
                maxLength={100}
              />

              <Text style={styles.fieldLabel}>执行计划（Cron）</Text>
              <TextInput
                style={styles.fieldInput}
                value={schedule}
                onChangeText={setSchedule}
                placeholder="0 9 * * *"
                autoCapitalize="none"
              />

              {/* Cron presets */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presets}>
                {CRON_PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.value}
                    style={[styles.preset, schedule === p.value && styles.presetActive]}
                    onPress={() => setSchedule(p.value)}
                  >
                    <Text style={[styles.presetText, schedule === p.value && styles.presetTextActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>任务内容（提示词）</Text>
              <TextInput
                style={[styles.fieldInput, styles.textarea]}
                value={prompt}
                onChangeText={setPrompt}
                placeholder="AI 执行的任务描述，例：总结今日新闻并发送给我"
                multiline
                maxLength={8000}
                textAlignVertical="top"
              />
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
    addBtn: { color: c.primary, fontSize: 24, flex: 1, textAlign: "right", lineHeight: 28 },
    card: {
      backgroundColor: c.card,
      marginHorizontal: 12,
      marginTop: 10,
      borderRadius: 12,
      padding: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
    cardName: { fontWeight: "600", fontSize: 15, color: c.text },
    cardCron: { fontSize: 12, color: c.textMuted, fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace" },
    cardPrompt: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    cardMeta: { fontSize: 12, color: c.textMuted },
    deleteBtn: { color: c.danger, fontSize: 13 },
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
    modalBody: { flex: 1, padding: 16 },
    fieldLabel: { fontWeight: "600", fontSize: 14, color: c.text, marginBottom: 6 },
    fieldInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      marginBottom: 12,
      color: c.text,
      backgroundColor: c.card,
    },
    presets: { marginBottom: 12 },
    preset: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8,
    },
    presetActive: { borderColor: c.primary, backgroundColor: c.primary },
    presetText: { fontSize: 13, color: c.textMuted },
    presetTextActive: { color: c.primaryText },
    textarea: { minHeight: 140, textAlignVertical: "top" },
  });
