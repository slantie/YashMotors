import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import colors from "@/constants/colors";

export interface FilterChip {
  key: string;
  label: string;
  count: number;
}

interface Props {
  chips: FilterChip[];
  active: string;
  onSelect: (key: string) => void;
}

function StatusFilterChipsBase({ chips, active, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {chips.map((chip) => {
        const isActive = active === chip.key;
        return (
          <Pressable
            key={chip.key}
            onPress={() => onSelect(chip.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${chip.label}, ${chip.count} cases`}
            hitSlop={6}
            style={[styles.chip, isActive && styles.chipActive]}
          >
            <Text style={[styles.text, isActive && styles.textActive]}>{chip.label}</Text>
            {chip.count > 0 && (
              <View style={[styles.countWrap, isActive && styles.countWrapActive]}>
                <Text style={[styles.count, isActive && styles.countActive]}>{chip.count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const StatusFilterChips = React.memo(StatusFilterChipsBase);

const styles = StyleSheet.create({
  scroll: { maxHeight: 46 },
  container: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 8,
    minHeight: 36,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium", color: colors.textSecondary },
  textActive: { color: "#fff" },
  countWrap: {
    minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 9,
    backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center",
  },
  countWrapActive: { backgroundColor: "#ffffff33" },
  count: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const, color: colors.textSecondary },
  countActive: { color: "#fff" },
});
