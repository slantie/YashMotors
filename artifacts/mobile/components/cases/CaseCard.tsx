import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import colors from "@/constants/colors";
import type { CaseListItem } from "@/services/cases";
import { toTitleCase } from "@/components/CarModelDropdown";
import { StatusBadge } from "./StatusBadge";

interface CaseCardProps {
  item: CaseListItem;
  onPress: () => void;
  showAdvisor?: boolean;
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

function isOverdue(dueDate?: string | null, status?: string): boolean {
  if (!dueDate || !status) return false;
  if (["delivered", "cancelled"].includes(status)) return false;
  try {
    const due = new Date(dueDate);
    if (isNaN(due.getTime())) return false;
    return due.getTime() < Date.now();
  } catch {
    return false;
  }
}

export function CaseCard({ item, onPress, showAdvisor }: CaseCardProps) {
  const overdue = isOverdue(item.dueDate, item.internalStatus);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        overdue && styles.cardOverdue,
        pressed && styles.pressed,
      ]}
    >
      {/* Thumbnail */}
      {item.primaryImageUrl ? (
        <Image
          source={{ uri: item.primaryImageUrl }}
          style={styles.thumb}
          contentFit="cover"
          transition={180}
        />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Feather name="image" size={20} color={colors.border} />
        </View>
      )}

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={styles.caseNumber}>{item.caseNumber}</Text>
          <View style={styles.topRight}>
            {overdue && (
              <View style={styles.overdueTag}>
                <Feather name="alert-triangle" size={10} color="#B54708" />
                <Text style={styles.overdueText}>Overdue</Text>
              </View>
            )}
            <Text style={styles.time}>{timeAgo(item.updatedAt)}</Text>
          </View>
        </View>

        <Text style={styles.vehicle} numberOfLines={1}>
          {item.vehicleNumber}
        </Text>
        <Text style={styles.model} numberOfLines={1}>
          {toTitleCase(item.carModel)}
        </Text>

        <View style={styles.bottomRow}>
          <StatusBadge status={item.internalStatus} type="internal" />
          {showAdvisor && item.advisorName ? (
            <View style={styles.advisorTag}>
              <Feather name="user" size={10} color={colors.primary} />
              <Text style={styles.advisorText} numberOfLines={1}>
                {item.advisorName}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    overflow: "hidden",
  },
  cardOverdue: {
    borderColor: "#B54708" + "55",
    backgroundColor: "#B54708" + "04",
  },
  pressed: { opacity: 0.78 },

  thumb: {
    width: 104,
    height: 104,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    flexShrink: 0,
  },
  thumbPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  info: { flex: 1, gap: 3 },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  overdueTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#B54708" + "15",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  overdueText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#B54708",
  },
  caseNumber: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
    fontVariant: ["tabular-nums"],
  },
  time: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },

  vehicle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  model: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
  },

  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  advisorTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryFaint,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  advisorText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.primary,
    maxWidth: 100,
  },
});
