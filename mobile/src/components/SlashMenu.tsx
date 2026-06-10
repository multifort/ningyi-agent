import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Skill } from "../api/skills";
import { useColors } from "../theme/useColors";
import type { Palette } from "../theme/colors";

export interface SlashItem {
  cmd: string;
  desc: string;
  kind: "builtin" | "skill";
  skillName?: string;
}

const BUILTINS: SlashItem[] = [
  { cmd: "/new", desc: "新建对话", kind: "builtin" },
  { cmd: "/clear", desc: "清空当前对话", kind: "builtin" },
  { cmd: "/share", desc: "生成分享链接", kind: "builtin" },
];

/** Popup shown above the input when the user types a leading "/". */
export function SlashMenu({
  query,
  skills,
  onSelect,
}: {
  query: string;
  skills: Skill[];
  onSelect: (item: SlashItem) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const filtered = useMemo(() => {
    const q = query.replace(/^\//, "").toLowerCase();
    const skillItems: SlashItem[] = skills.map((s) => ({
      cmd: `/${s.name}`,
      desc: s.description || "Hermes 技能",
      kind: "skill" as const,
      skillName: s.name,
    }));
    const all = [...BUILTINS, ...skillItems];
    if (!q) return all;
    return all.filter(
      (i) => i.cmd.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q),
    );
  }, [query, skills]);

  if (filtered.length === 0) return null;

  return (
    <View style={styles.menu}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
        {filtered.map((item) => (
          <TouchableOpacity key={item.cmd} style={styles.item} onPress={() => onSelect(item)}>
            <Text style={styles.cmd}>{item.cmd}</Text>
            <Text style={styles.desc} numberOfLines={1}>
              {item.desc}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    menu: {
      backgroundColor: c.card,
      borderTopWidth: 1,
      borderColor: c.border,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: -2 },
    },
    item: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 10,
    },
    cmd: { color: c.primary, fontSize: 14, fontWeight: "600" },
    desc: { color: c.textMuted, fontSize: 13, flex: 1 },
  });
