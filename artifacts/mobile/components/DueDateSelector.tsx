import { Feather } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import colors from "@/constants/colors";

export type DueDateOption = "tomorrow" | "day-after" | "later";

interface DueDateSelectorProps {
  value: DueDateOption | "";
  onChange: (v: DueDateOption) => void;
  error?: string;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function DueDateSelector({ value, onChange, error }: DueDateSelectorProps) {
  const options = useMemo(() => {
    const today = new Date();

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const dayAfter = new Date(today);
    dayAfter.setDate(today.getDate() + 2);

    return [
      {
        id: "tomorrow" as DueDateOption,
        label: "Tomorrow",
        date: formatShortDate(tomorrow),
        icon: "sun" as const,
      },
      {
        id: "day-after" as DueDateOption,
        label: "Day After",
        date: formatShortDate(dayAfter),
        icon: "calendar" as const,
      },
      {
        id: "later" as DueDateOption,
        label: "Later",
        date: "To be confirmed",
        icon: "clock" as const,
      },
    ];
  }, []);

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Due Date</Text>
        <Text style={styles.optional}>optional</Text>
      </View>

      <View style={styles.grid}>
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => onChange(opt.id)}
              style={({ pressed }) => [
                styles.card,
                selected && styles.cardSelected,
                pressed && styles.cardPressed,
              ]}
            >
              <View
                style={[
                  styles.iconWrap,
                  selected && styles.iconWrapSelected,
                ]}
              >
                <Feather
                  name={opt.icon}
                  size={16}
                  color={selected ? "#fff" : colors.textSecondary}
                />
              </View>
              <Text
                style={[styles.optLabel, selected && styles.optLabelSelected]}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
              <Text
                style={[styles.optDate, selected && styles.optDateSelected]}
                numberOfLines={1}
              >
                {opt.date}
              </Text>
              {selected && (
                <View style={styles.checkmark}>
                  <Feather name="check" size={10} color="#fff" />
                </View>
              )}
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
    fontFamily: "Inter_500Medium",
    fontWeight: "500" as const,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  optional: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  grid: {
    flexDirection: "row",
    gap: 8,
  },
  card: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 12,
    alignItems: "flex-start",
    position: "relative",
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaint,
  },
  cardPressed: {
    opacity: 0.75,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  iconWrapSelected: {
    backgroundColor: colors.primary,
  },
  optLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    marginBottom: 2,
  },
  optLabelSelected: {
    color: colors.primary,
  },
  optDate: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  optDateSelected: {
    color: colors.primary,
    opacity: 0.8,
  },
  checkmark: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    fontSize: 12,
    color: colors.destructive,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
  },
});
