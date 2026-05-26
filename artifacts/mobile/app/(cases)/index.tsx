import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { CaseCard } from "@/components/cases/CaseCard";
import colors from "@/constants/colors";
import { fetchCases } from "@/services/cases";
import { useAuthStore } from "@/store/useAuthStore";

export default function CasesScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const userId = user?.id;
  const canCreate =
    role === "superadmin" || role === "admin" || role === "advisor";

  const [search, setSearch] = useState("");

  const casesQuery = useQuery({
    queryKey: ["cases"],
    queryFn: fetchCases,
  });

  const visibleCases = (() => {
    let all = casesQuery.data ?? [];
    if (role === "technician") {
      all = all.filter(
        (item) => !["delivered", "cancelled"].includes(item.internalStatus),
      );
    } else if (role === "advisor" && userId != null) {
      all = all.filter((item) => Number(item.advisorId) === Number(userId));
    }
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      all = all.filter(
        (item) =>
          item.vehicleNumber.toUpperCase().includes(q) ||
          item.caseNumber.toUpperCase().includes(q) ||
          (item.advisorName ?? "").toUpperCase().includes(q) ||
          item.carModel.toUpperCase().includes(q) ||
          (item.customerName ?? "").toUpperCase().includes(q),
      );
    }
    return all;
  })();

  return (
    <View style={styles.root}>
      <AppHeader
        title="Cases"
        rightElement={
          canCreate ? (
            <Pressable
              onPress={() => router.push("/intake")}
              style={styles.headerBtn}
            >
              <Feather name="plus" size={19} color={colors.primary} />
            </Pressable>
          ) : null
        }
      />

      <View style={styles.searchRow}>
        <Feather
          name="search"
          size={15}
          color={colors.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search plate, case #, model..."
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={15} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {casesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : casesQuery.isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Could not load cases</Text>
          <Text style={styles.emptyText}>
            {casesQuery.error instanceof Error
              ? casesQuery.error.message
              : "Please try again."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleCases}
          keyExtractor={(item) => item.caseNumber}
          renderItem={({ item }) => (
            <CaseCard
              item={item}
              showAdvisor={role === "superadmin" || role === "admin"}
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
            { paddingBottom: insets.bottom + 24 },
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text,
    paddingVertical: 0,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  list: { padding: 16, gap: 10 },
  emptyList: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },
});
