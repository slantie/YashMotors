import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import colors from "@/constants/colors";
import type { CustomerArrivalStatus } from "@/services/cases";

const OPTIONS: { id: CustomerArrivalStatus; label: string; icon: "user" | "truck" | "clock" | "alert-triangle" }[] = [
  { id: "walk_in", label: "Walk-in", icon: "user" },
  { id: "pickup", label: "Pickup", icon: "truck" },
  { id: "customer_waiting", label: "Customer Waiting", icon: "clock" },
  { id: "breakdown", label: "Breakdown", icon: "alert-triangle" },
];

interface Props {
  value: CustomerArrivalStatus | "";
  onChange: (v: CustomerArrivalStatus) => void;
  error?: string;
}

export function CustomerArrivalStatusSelector({ value, onChange, error }: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Customer Status</Text>
        <Text style={styles.optional}>optional</Text>
      </View>
      <View style={styles.grid}>
        {OPTIONS.map((opt) => {
          const selected = value === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => onChange(opt.id)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
            >
              <Feather
                name={opt.icon}
                size={14}
                color={selected ? "#fff" : colors.textSecondary}
              />
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {opt.label}
              </Text>
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
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    fontWeight: "500" as const,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  optional: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: { opacity: 0.75 },
  chipText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.text,
  },
  chipTextSelected: {
    color: "#fff",
  },
  error: {
    fontSize: 12,
    color: colors.destructive,
    fontFamily: "PlusJakartaSans_400Regular",
    marginTop: 6,
  },
});
