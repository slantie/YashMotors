import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

import colors from "@/constants/colors";

interface FormInputProps extends TextInputProps {
  label: string;
  error?: string;
  optional?: boolean;
}

export function FormInput({
  label,
  error,
  optional,
  style,
  ...props
}: FormInputProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional && <Text style={styles.optional}>optional</Text>}
      </View>
      <TextInput
        style={[styles.input, error ? styles.inputError : null, style]}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
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
    textTransform: "lowercase",
    letterSpacing: 0,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
  },
  inputError: {
    borderColor: colors.destructive,
  },
  error: {
    fontSize: 12,
    color: colors.destructive,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
});
