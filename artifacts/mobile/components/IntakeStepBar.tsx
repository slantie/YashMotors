import React from "react";
import { StyleSheet, Text, View } from "react-native";

import colors from "@/constants/colors";

const STEPS = ["Job Card", "Plate Scan"] as const;

interface Props {
  currentStep: 0 | 1;
}

export function IntakeStepBar({ currentStep }: Props) {
  return (
    <View style={styles.row}>
      {STEPS.map((label, idx) => (
        <React.Fragment key={label}>
          {idx > 0 && (
            <View
              style={[
                styles.line,
                idx <= currentStep && styles.lineActive,
              ]}
            />
          )}
          <View style={styles.item}>
            <View
              style={[
                styles.dot,
                idx === currentStep && styles.dotActive,
                idx < currentStep && styles.dotDone,
              ]}
            />
            <Text
              style={[
                styles.label,
                idx <= currentStep && styles.labelActive,
              ]}
            >
              {label}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  item: {
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  dotDone: {
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  labelActive: {
    color: colors.primary,
  },
  line: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
    marginHorizontal: 8,
    marginBottom: 16,
  },
  lineActive: {
    backgroundColor: colors.primary,
  },
});
