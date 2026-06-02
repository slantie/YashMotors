import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import colors from "@/constants/colors";

export interface WorkloadStats {
  total: number;
  working: number;
  ready: number;
  attention: number;
}

const CARDS: {
  key: keyof WorkloadStats;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  tint: string;
}[] = [
  { key: "total", label: "Active", icon: "layers", color: colors.primary, tint: colors.primaryFaint },
  { key: "working", label: "In Work", icon: "tool", color: colors.warning, tint: colors.warningFaint },
  { key: "ready", label: "Ready", icon: "check-circle", color: colors.success, tint: colors.successFaint },
  { key: "attention", label: "Waiting", icon: "clock", color: colors.destructive, tint: colors.destructiveFaint },
];

function WorkloadSummaryBase({ stats }: { stats: WorkloadStats }) {
  return (
    <View style={styles.strip}>
      {CARDS.map((c) => (
        <View
          key={c.key}
          style={styles.card}
          accessibilityRole="text"
          accessibilityLabel={`${stats[c.key]} ${c.label}`}
        >
          <View style={[styles.iconWrap, { backgroundColor: c.tint }]}>
            <Feather name={c.icon} size={14} color={c.color} />
          </View>
          <Text style={styles.value}>{stats[c.key]}</Text>
          <Text style={styles.label}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

export const WorkloadSummary = React.memo(WorkloadSummaryBase);

const styles = StyleSheet.create({
  strip: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  card: {
    flex: 1, alignItems: "center", gap: 3,
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 12, paddingHorizontal: 6,
  },
  iconWrap: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  value: { fontSize: 19, fontFamily: "PlusJakartaSans_700Bold", fontWeight: "700" as const, color: colors.text },
  label: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium", color: colors.textSecondary },
});
