import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import colors from "@/constants/colors";
import { addEvent } from "@/services/caseEvents";
import type { AuthRole } from "@/store/useAuthStore";

const MAX_CHARS = 2000;

const EVENT_TYPES = [
  { value: "technician_update", label: "Workshop Update" },
  { value: "customer_update", label: "Customer Update" },
] as const;

interface AddEventFormProps {
  caseNumber: string;
  role: AuthRole | undefined;
  onSuccess: () => void;
}

export function AddEventForm({
  caseNumber,
  role,
  onSuccess,
}: AddEventFormProps) {
  const queryClient = useQueryClient();
  const canPostCustomer = role === "superadmin" || role === "admin" || role === "advisor";
  const [eventType, setEventType] = useState<"technician_update" | "customer_update">("technician_update");
  const [message, setMessage] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      addEvent(caseNumber, { eventType, message: message.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseNumber] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessage("");
      onSuccess();
    },
  });

  const handleSubmit = () => {
    if (!message.trim() || mutation.isPending) return;
    mutation.mutate();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Add Update</Text>

      {canPostCustomer && (
        <View style={styles.typeRow}>
          {EVENT_TYPES.map((type) => (
            <Pressable
              key={type.value}
              onPress={() => setEventType(type.value)}
              style={[
                styles.typeChip,
                eventType === type.value && styles.typeChipActive,
              ]}
            >
              <Text
                style={[
                  styles.typeChipText,
                  eventType === type.value && styles.typeChipTextActive,
                ]}
              >
                {type.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {!canPostCustomer && (
        <Text style={styles.fixedType}>Workshop Update</Text>
      )}

      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder="Describe the update..."
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={MAX_CHARS}
        style={styles.textInput}
      />

      <View style={styles.bottomRow}>
        <Text
          style={[
            styles.charsLeft,
            message.length > MAX_CHARS - 200 && styles.charsLeftWarn,
          ]}
        >
          {message.length}/{MAX_CHARS}
        </Text>
        <Pressable
          onPress={handleSubmit}
          disabled={!message.trim() || mutation.isPending}
          style={[
            styles.submitBtn,
            (!message.trim() || mutation.isPending) && styles.disabled,
          ]}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitText}>Submit Update</Text>
          )}
        </Pressable>
      </View>

      {mutation.isError && (
        <Text style={styles.error}>
          {mutation.error instanceof Error
            ? mutation.error.message
            : "Failed to submit update."}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    marginBottom: 12,
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.textSecondary,
  },
  typeChipTextActive: {
    color: "#fff",
  },
  fixedType: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.textMuted,
    marginBottom: 12,
  },
  textInput: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    padding: 12,
    color: colors.text,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    textAlignVertical: "top",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  charsLeft: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
  },
  charsLeftWarn: {
    color: colors.destructive,
  },
  submitBtn: {
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.55 },
  submitText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
  },
  error: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.destructive,
    marginTop: 8,
  },
});
