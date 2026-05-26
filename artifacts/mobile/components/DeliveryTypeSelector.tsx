import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import colors from "@/constants/colors";

export type DeliveryType = "walk-in" | "pickup-drop" | "breakdown";

const OPTIONS: {
  id: DeliveryType;
  label: string;
  sub: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  {
    id: "walk-in",
    label: "Walk-in",
    sub: "Customer drove in",
    icon: "user",
  },
  {
    id: "pickup-drop",
    label: "Pickup / Drop",
    sub: "Vehicle collected",
    icon: "truck",
  },
  {
    id: "breakdown",
    label: "Breakdown",
    sub: "Roadside assist",
    icon: "alert-triangle",
  },
];

interface DeliveryTypeSelectorProps {
  value: DeliveryType | "";
  onChange: (v: DeliveryType) => void;
  error?: string;
}

export function DeliveryTypeSelector({
  value,
  onChange,
  error,
}: DeliveryTypeSelectorProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Delivery Type</Text>
      </View>

      <View style={styles.row}>
        {OPTIONS.map((opt) => {
          const selected = value === opt.id;
          const isBreakdown = opt.id === "breakdown";

          return (
            <Pressable
              key={opt.id}
              onPress={() => onChange(opt.id)}
              style={({ pressed }) => [
                styles.chip,
                selected && (isBreakdown ? styles.chipBreakdown : styles.chipSelected),
                pressed && styles.chipPressed,
              ]}
            >
              <View
                style={[
                  styles.chipIcon,
                  selected && (isBreakdown ? styles.chipIconBreakdown : styles.chipIconSelected),
                ]}
              >
                <Feather
                  name={opt.icon}
                  size={15}
                  color={
                    selected
                      ? "#fff"
                      : isBreakdown
                      ? colors.destructive
                      : colors.textSecondary
                  }
                />
              </View>
              <View style={styles.chipText}>
                <Text
                  style={[
                    styles.chipLabel,
                    selected &&
                      (isBreakdown
                        ? styles.chipLabelBreakdown
                        : styles.chipLabelSelected),
                  ]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
                <Text
                  style={[
                    styles.chipSub,
                    selected && styles.chipSubSelected,
                  ]}
                  numberOfLines={1}
                >
                  {opt.sub}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    fontWeight: "500" as const,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 10,
    alignItems: "center",
    gap: 6,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaint,
  },
  chipBreakdown: {
    borderColor: colors.destructive,
    backgroundColor: colors.destructive + "15",
  },
  chipPressed: {
    opacity: 0.72,
  },
  chipIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipIconSelected: {
    backgroundColor: colors.primary,
  },
  chipIconBreakdown: {
    backgroundColor: colors.destructive,
  },
  chipText: {
    alignItems: "center",
  },
  chipLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    textAlign: "center",
  },
  chipLabelSelected: {
    color: colors.primary,
  },
  chipLabelBreakdown: {
    color: colors.destructive,
  },
  chipSub: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 1,
  },
  chipSubSelected: {
    color: colors.textSecondary,
  },
  error: {
    fontSize: 12,
    color: colors.destructive,
    fontFamily: "PlusJakartaSans_400Regular",
    marginTop: 6,
  },
});
