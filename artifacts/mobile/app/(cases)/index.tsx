import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { CaseCard } from "@/components/cases/CaseCard";
import colors from "@/constants/colors";
import { CreateCaseBody, createCase, fetchCases } from "@/services/cases";
import { useAuthStore } from "@/store/useAuthStore";

const initialForm: CreateCaseBody = {
  vehicleNumber: "",
  carModel: "",
  customerPhone: "",
  kmCount: "",
  dueDate: "",
  deliveryType: "",
  notes: "",
};

export default function CasesScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const userId = user?.id;
  const isPrivileged = role === "superadmin" || role === "admin" || role === "advisor";
  const canCreate = isPrivileged;
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateCaseBody>(initialForm);
  const [error, setError] = useState("");

  const casesQuery = useQuery({
    queryKey: ["cases"],
    queryFn: fetchCases,
  });
  const visibleCases = (() => {
    const all = casesQuery.data ?? [];
    if (role === "technician") {
      return all.filter((item) => !["delivered", "cancelled"].includes(item.internalStatus));
    }
    if (role === "advisor" && userId != null) {
      return all.filter((item) => Number(item.advisorId) === Number(userId));
    }
    return all;
  })();

  const createMutation = useMutation({
    mutationFn: createCase,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalOpen(false);
      setForm(initialForm);
      router.push({ pathname: "/(cases)/[caseNumber]", params: { caseNumber: created.caseNumber } });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not create case.");
    },
  });

  const handleCreate = () => {
    if (!form.vehicleNumber.trim() || !form.carModel.trim()) {
      setError("Vehicle number and car model are required.");
      return;
    }

    const body = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
    ) as CreateCaseBody;

    createMutation.mutate(body);
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title="Cases"
        rightElement={
          canCreate ? (
            <Pressable onPress={() => setModalOpen(true)} style={styles.headerBtn}>
              <Feather name="plus" size={19} color={colors.primary} />
            </Pressable>
          ) : null
        }
      />

      {casesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : casesQuery.isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Could not load cases</Text>
          <Text style={styles.emptyText}>
            {casesQuery.error instanceof Error ? casesQuery.error.message : "Please try again."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleCases}
          keyExtractor={(item) => item.caseNumber}
          renderItem={({ item }) => (
            <CaseCard
              item={item}
              onPress={() =>
                router.push({
                  pathname: "/(cases)/[caseNumber]",
                  params: { caseNumber: item.caseNumber },
                })
              }
            />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 90 },
            visibleCases.length === 0 && styles.emptyList,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={casesQuery.isRefetching}
              onRefresh={casesQuery.refetch}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="folder" size={34} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No cases yet</Text>
              <Text style={styles.emptyText}>
                {role === "advisor"
                  ? "No cases have been assigned to you yet."
                  : "Create a case when a vehicle enters the workshop."}
              </Text>
            </View>
          }
        />
      )}

      {canCreate && (
        <Pressable
          onPress={() => setModalOpen(true)}
          style={[styles.fab, { bottom: insets.bottom + 22 }]}
        >
          <Feather name="plus" size={24} color="#fff" />
        </Pressable>
      )}

      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalRoot}>
          <AppHeader
            title="New Case"
            rightElement={
              <Pressable onPress={() => setModalOpen(false)} style={styles.headerBtn} hitSlop={8}>
                <Feather name="x" size={19} color={colors.primary} />
              </Pressable>
            }
          />
          <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + 24 }]}>
            <Field label="Vehicle Number" value={form.vehicleNumber} onChangeText={(v) => setForm({ ...form, vehicleNumber: v.toUpperCase() })} />
            <Field label="Car Model" value={form.carModel} onChangeText={(v) => setForm({ ...form, carModel: v })} />
            <Field label="Customer Phone" value={form.customerPhone ?? ""} keyboardType="phone-pad" onChangeText={(v) => setForm({ ...form, customerPhone: v })} />
            <Field label="KM Count" value={form.kmCount ?? ""} keyboardType="numeric" onChangeText={(v) => setForm({ ...form, kmCount: v })} />
            <Field label="Due Date" value={form.dueDate ?? ""} onChangeText={(v) => setForm({ ...form, dueDate: v })} />
            <Field label="Delivery Type" value={form.deliveryType ?? ""} onChangeText={(v) => setForm({ ...form, deliveryType: v })} />
            <Field label="Notes" value={form.notes ?? ""} multiline onChangeText={(v) => setForm({ ...form, notes: v })} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              onPress={handleCreate}
              disabled={createMutation.isPending}
              style={[styles.createBtn, createMutation.isPending && styles.disabled]}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createText}>Create Case</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setModalOpen(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "numeric" | "phone-pad";
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        style={[styles.input, multiline && styles.textarea]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryFaint,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  list: {
    padding: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  modalRoot: { flex: 1, backgroundColor: colors.background },
  modalContent: { padding: 16 },
  field: { marginBottom: 14 },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  textarea: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  error: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.destructive,
    marginBottom: 12,
  },
  createBtn: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  disabled: { opacity: 0.55 },
  createText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.textSecondary,
  },
});
