import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import colors from "@/constants/colors";
import type { CaseListItem } from "@/services/cases";
import { StatusBadge } from "./StatusBadge";

interface CaseCardProps {
  item: CaseListItem;
  onPress: () => void;
}

function timeAgo(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(delta / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CaseCard({ item, onPress }: CaseCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <Text style={styles.caseNumber}>{item.caseNumber}</Text>
        <Text style={styles.time}>{timeAgo(item.updatedAt)}</Text>
      </View>
      <Text style={styles.vehicle}>{item.vehicleNumber}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.model} numberOfLines={1}>
          {item.carModel}
        </Text>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </View>
      <StatusBadge status={item.internalStatus} type="internal" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  pressed: {
    opacity: 0.78,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  caseNumber: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
  time: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  vehicle: {
    fontSize: 19,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  model: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
  },
});
