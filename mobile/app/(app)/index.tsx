import React, { useCallback, useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  SafeAreaView,
  Share,
} from "react-native";
import { router } from "expo-router";
import { useColors } from "../../src/theme/useColors";
import type { Palette } from "../../src/theme/colors";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listConversations,
  createConversation,
  deleteConversation,
  searchConversations,
  shareConversation,
  Conversation,
  SearchResult,
} from "../../src/api/conversations";
import { useAuth } from "../../src/auth/AuthContext";
import { useSettingsStore } from "../../src/stores/settingsStore";

export default function ConversationListScreen() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: conversations = [], isLoading, refetch } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });

  // ── Search (debounced) ──
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const isSearching = debouncedQuery.length > 0;
  const { data: searchResults = [], isFetching: searchLoading } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => searchConversations(debouncedQuery),
    enabled: isSearching,
  });

  const createMut = useMutation({
    mutationFn: createConversation,
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      router.push(`/(app)/chat/${conv.id}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  async function handleShare(id: string) {
    try {
      const info = await shareConversation(id);
      const base = useSettingsStore.getState().baseURL.replace(/\/$/, "");
      const fullUrl = `${base}${info.url}`;
      await Share.share({ message: fullUrl, url: fullUrl });
    } catch {
      Alert.alert("分享失败", "请稍后重试");
    }
  }

  function handleItemActions(id: string, title: string) {
    Alert.alert(title, "", [
      { text: "分享", onPress: () => handleShare(id) },
      {
        text: "删除",
        style: "destructive",
        onPress: () =>
          Alert.alert("删除对话", `确定删除「${title}」？`, [
            { text: "取消", style: "cancel" },
            { text: "删除", style: "destructive", onPress: () => deleteMut.mutate(id) },
          ]),
      },
      { text: "取消", style: "cancel" },
    ]);
  }

  async function handleLogout() {
    await logout();
    router.replace("/(auth)/login");
  }

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <TouchableOpacity
        style={styles.item}
        onPress={() => router.push(`/(app)/chat/${item.id}`)}
        onLongPress={() => handleItemActions(item.id, item.title)}
      >
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.itemDate}>
          {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
        </Text>
      </TouchableOpacity>
    ),
    [],
  );

  const renderSearchItem = useCallback(
    ({ item }: { item: SearchResult }) => (
      <TouchableOpacity
        style={styles.item}
        onPress={() => router.push(`/(app)/chat/${item.conversationId}`)}
      >
        <View style={styles.searchTextWrap}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.snippet ? (
            <Text style={styles.snippet} numberOfLines={1}>
              {item.snippet}
            </Text>
          ) : null}
        </View>
        <Text style={styles.itemDate}>
          {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
        </Text>
      </TouchableOpacity>
    ),
    [],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/(app)/settings")}>
          <Text style={styles.avatar}>
            {user?.displayName?.[0] ?? user?.username?.[0] ?? "?"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>对话</Text>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => createMut.mutate()}
        >
          <Text style={styles.newBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="搜索对话内容或标题"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {isSearching ? (
        <FlatList
          data={searchResults}
          keyExtractor={(r) => r.conversationId}
          renderItem={renderSearchItem}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {searchLoading ? "搜索中…" : "没有找到匹配的对话"}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>还没有对话</Text>
              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => createMut.mutate()}
              >
                <Text style={styles.startBtnText}>开始第一次对话</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.push("/(app)/memory")}>
          <Text style={styles.tabIcon}>🧠</Text>
          <Text style={styles.tabLabel}>记忆</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.push("/(app)/skills")}>
          <Text style={styles.tabIcon}>⚡</Text>
          <Text style={styles.tabLabel}>技能</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.push("/(app)/scheduler")}>
          <Text style={styles.tabIcon}>⏰</Text>
          <Text style={styles.tabLabel}>定时</Text>
        </TouchableOpacity>
      </View>
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
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.primary,
      color: c.primaryText,
      textAlign: "center",
      lineHeight: 36,
      fontSize: 16,
      fontWeight: "600",
      overflow: "hidden",
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontSize: 17,
      fontWeight: "600",
      color: c.text,
    },
    newBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    newBtnText: { fontSize: 24, color: c.primary },
    item: {
      backgroundColor: c.card,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    itemTitle: { flex: 1, fontSize: 15, color: c.text },
    itemDate: { fontSize: 12, color: c.textMuted, marginLeft: 8 },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 8,
    },
    searchIcon: { fontSize: 14 },
    searchInput: { flex: 1, fontSize: 15, paddingVertical: 4, color: c.text },
    searchClear: { fontSize: 14, color: c.textMuted },
    searchTextWrap: { flex: 1 },
    snippet: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    empty: { flex: 1, alignItems: "center", marginTop: 80, gap: 16 },
    emptyText: { color: c.textMuted, fontSize: 16 },
    startBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 24,
    },
    startBtnText: { color: c.primaryText, fontWeight: "600" },
    tabBar: {
      flexDirection: "row",
      backgroundColor: c.card,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingBottom: 4,
    },
    tabItem: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      gap: 2,
    },
    tabIcon: { fontSize: 22 },
    tabLabel: { fontSize: 11, color: c.textMuted },
  });
