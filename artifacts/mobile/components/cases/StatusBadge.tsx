import React from "react";
import { StyleSheet, Text, View } from "react-native";

import colors from "@/constants/colors";
import type { CustomerStatus, InternalStatus } from "@/services/cases";

interface StatusBadgeProps {
  status: InternalStatus | CustomerStatus;
  type: "internal" | "customer";
}

const statusColors: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  intake: { bg: "#EEF2F6", text: colors.textSecondary, border: colors.border },
  in_progress: { bg: "#EAF0FF", text: colors.primary, border: "#B8C7F0" },
  awaiting_parts: { bg: "#FFF7E6", text: colors.warning, border: "#FEDF89" },
  denting: { bg: "#F0F9FF", text: "#026AA2", border: "#B9E6FE" },
  painting: { bg: "#F4EBFF", text: "#6941C6", border: "#D6BBFB" },
  polishing: { bg: "#ECFDF3", text: "#027A48", border: "#ABEFC6" },
  electrical: { bg: "#FFF4ED", text: "#C4320A", border: "#F9DBAF" },
  washing: { bg: "#E0F2FE", text: "#075985", border: "#BAE6FD" },
  quality_check: { bg: "#EEF4FF", text: "#3538CD", border: "#C7D7FE" },
  ready: { bg: "#ECFDF3", text: "#027A48", border: "#ABEFC6" },
  delivered: {
    bg: "#F2F4F7",
    text: colors.textSecondary,
    border: colors.border,
  },
  cancelled: { bg: "#FEF3F2", text: "#B42318", border: "#FECDCA" },
  received: {
    bg: "#EEF2F6",
    text: colors.textSecondary,
    border: colors.border,
  },
  in_repair: { bg: "#EAF0FF", text: colors.primary, border: "#B8C7F0" },
  final_inspection: { bg: "#EEF4FF", text: "#3538CD", border: "#C7D7FE" },
  ready_for_delivery: { bg: "#ECFDF3", text: "#027A48", border: "#ABEFC6" },
};

export function statusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  const palette = statusColors[status] ?? statusColors.intake;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
      ]}
    >
      <Text style={[styles.text, { color: palette.text }]}>
        {type === "customer" ? "Customer: " : ""}
        {statusLabel(status)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  text: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
  },
});
