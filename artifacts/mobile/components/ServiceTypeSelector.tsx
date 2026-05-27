import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import colors from "@/constants/colors";
import type { ServiceSubType, ServiceType } from "@/services/cases";

const SERVICE_TYPES: { id: ServiceType; label: string; icon: "tool" | "settings" }[] = [
  { id: "service", label: "Service", icon: "settings" },
  { id: "repair", label: "Repair", icon: "tool" },
];

const SERVICE_SUB_TYPES: { id: ServiceSubType; label: string }[] = [
  { id: "major", label: "Major" },
  { id: "minor", label: "Minor" },
  { id: "breakdown", label: "Breakdown" },
  { id: "running", label: "Running" },
];

interface Props {
  serviceType: ServiceType | "";
  serviceSubType: ServiceSubType | "";
  onServiceTypeChange: (v: ServiceType) => void;
  onServiceSubTypeChange: (v: ServiceSubType) => void;
  error?: string;
}

export function ServiceTypeSelector({
  serviceType,
  serviceSubType,
  onServiceTypeChange,
  onServiceSubTypeChange,
  error,
}: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Service Type</Text>
        <Text style={styles.optional}>optional</Text>
      </View>

      <View style={styles.typeRow}>
        {SERVICE_TYPES.map((opt) => {
          const selected = serviceType === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => onServiceTypeChange(opt.id)}
              style={({ pressed }) => [
                styles.typeCard,
                selected && styles.typeCardSelected,
                pressed && styles.typeCardPressed,
              ]}
            >
              <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
                <Feather
                  name={opt.icon}
                  size={16}
                  color={selected ? "#fff" : colors.textSecondary}
                />
              </View>
              <Text style={[styles.typeText, selected && styles.typeTextSelected]}>
                {opt.label}
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

      {serviceType === "service" && (
        <View style={styles.subSection}>
          <Text style={styles.subLabel}>Service Category</Text>
          <View style={styles.subGrid}>
            {SERVICE_SUB_TYPES.map((sub) => {
              const selected = serviceSubType === sub.id;
              return (
                <Pressable
                  key={sub.id}
                  onPress={() => onServiceSubTypeChange(sub.id)}
                  style={({ pressed }) => [
                    styles.subChip,
                    selected && styles.subChipSelected,
                    pressed && styles.subChipPressed,
                  ]}
                >
                  <Text style={[styles.subChipText, selected && styles.subChipTextSelected]}>
                    {sub.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

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
  typeRow: {
    flexDirection: "row",
    gap: 8,
  },
  typeCard: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 12,
    alignItems: "flex-start",
    position: "relative",
  },
  typeCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaint,
  },
  typeCardPressed: { opacity: 0.75 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  iconWrapSelected: { backgroundColor: colors.primary },
  typeText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  typeTextSelected: { color: colors.primary },
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
  subSection: {
    marginTop: 12,
  },
  subLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textMuted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  subChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  subChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  subChipPressed: { opacity: 0.75 },
  subChipText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.text,
  },
  subChipTextSelected: { color: "#fff" },
  error: {
    fontSize: 12,
    color: colors.destructive,
    fontFamily: "PlusJakartaSans_400Regular",
    marginTop: 6,
  },
});
