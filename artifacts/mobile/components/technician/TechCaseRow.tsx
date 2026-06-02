import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import colors from "@/constants/colors";
import type { CaseListItem } from "@/services/cases";
import { statusColor, statusLabel, waitingLabel, waitingHours, STALE_HOURS } from "./status";

interface Props {
  item: CaseListItem;
  onPress: (caseNumber: string) => void;
}

function TechCaseRowBase({ item, onPress }: Props) {
  const color = statusColor(item.internalStatus);
  const label = statusLabel(item.internalStatus);
  const wait = waitingLabel(item.updatedAt);
  const stale = waitingHours(item.updatedAt) >= STALE_HOURS;

  return (
    <Pressable
      onPress={() => onPress(item.caseNumber)}
      accessibilityRole="button"
      accessibilityLabel={`Case ${item.caseNumber}, ${item.vehicleNumber}, ${label}, waiting ${wait}`}
      style={({ pressed }) => [
        styles.row,
        { borderLeftColor: color },
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.left}>
        <View style={styles.topLine}>
          <View style={[styles.caseBadge, { backgroundColor: color + "15", borderColor: color + "40" }]}>
            <Text style={[styles.caseText, { color }]}>{item.caseNumber}</Text>
          </View>
          {stale && (
            <View style={styles.staleBadge}>
              <Feather name="clock" size={10} color={colors.destructive} />
              <Text style={styles.staleText}>{wait}</Text>
            </View>
          )}
        </View>
        <Text style={styles.vehicle} numberOfLines={1}>{item.vehicleNumber}</Text>
        {item.carModel ? (
          <Text style={styles.model} numberOfLines={1}>{item.carModel}</Text>
        ) : null}
        {item.advisorName ? (
          <Text style={styles.advisor} numberOfLines={1}>{item.advisorName}</Text>
        ) : null}
      </View>

      <View style={styles.right}>
        <View style={[styles.pill, { backgroundColor: color + "18", borderColor: color + "44" }]}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.pillText, { color }]}>{label}</Text>
        </View>
        {!stale && <Text style={styles.wait}>{wait} ago</Text>}
        <Feather name="chevron-right" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

// Memoized: search keystrokes re-render the list; rows whose item is unchanged skip render.
export const TechCaseRow = React.memo(
  TechCaseRowBase,
  (prev, next) =>
    prev.item.caseNumber === next.item.caseNumber &&
    prev.item.internalStatus === next.item.internalStatus &&
    prev.item.updatedAt === next.item.updatedAt &&
    prev.onPress === next.onPress,
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3,
    paddingVertical: 14, paddingHorizontal: 14, gap: 12,
    minHeight: 76,
  },
  rowPressed: { opacity: 0.75 },

  left: { flex: 1, gap: 3 },
  topLine: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  caseBadge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  caseText: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const },
  staleBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: colors.destructiveFaint, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  staleText: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const, color: colors.destructive },

  vehicle: { fontSize: 17, fontFamily: "PlusJakartaSans_700Bold", fontWeight: "700" as const, color: colors.text },
  model: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", color: colors.textSecondary },
  advisor: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", color: colors.textMuted, marginTop: 1 },

  right: { alignItems: "flex-end", gap: 6 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium" },
  wait: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", color: colors.textMuted },
});
