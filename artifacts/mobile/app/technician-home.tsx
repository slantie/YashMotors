import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useCallback, useContext, useMemo, useState } from "react";
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
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";

import { AppHeader } from "@/components/AppHeader";
import { TechCaseRow } from "@/components/technician/TechCaseRow";
import { WorkloadSummary, type WorkloadStats } from "@/components/technician/WorkloadSummary";
import { StatusFilterChips, type FilterChip } from "@/components/technician/StatusFilterChips";
import {
  ACTIVE_STATUSES,
  WORKING_STATUSES,
  waitingHours,
  STALE_HOURS,
} from "@/components/technician/status";
import colors from "@/constants/colors";
import { fetchCases, type CaseListItem, type InternalStatus } from "@/services/cases";
import { useAuthStore } from "@/store/useAuthStore";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Filter predicates keyed by chip. "In Work" spans every working sub-status, not just the
// literal in_progress value (the old screen's bug — it hid denting/painting/etc.).
const FILTERS: Record<string, (s: InternalStatus) => boolean> = {
  all: () => true,
  working: (s) => WORKING_STATUSES.includes(s),
  awaiting_parts: (s) => s === "awaiting_parts",
  ready: (s) => s === "ready",
};

const CHIP_DEFS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "working", label: "In Work" },
  { key: "awaiting_parts", label: "Awaiting Parts" },
  { key: "ready", label: "Ready" },
];

export default function TechnicianHomeScreen() {
  // This screen renders both as the Home tab AND as the standalone /technician-home route.
  // useBottomTabBarHeight() THROWS outside a tab navigator, so read the context directly
  // and fall back to 0 when there is no tab bar.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const casesQuery = useQuery({
    queryKey: ["cases"],
    queryFn: () => fetchCases(),
    staleTime: 30_000,
  });

  const allActive = useMemo(
    () => (casesQuery.data ?? []).filter((c) => ACTIVE_STATUSES.includes(c.internalStatus)),
    [casesQuery.data],
  );

  const stats = useMemo<WorkloadStats>(
    () => ({
      total: allActive.length,
      working: allActive.filter((c) => WORKING_STATUSES.includes(c.internalStatus)).length,
      ready: allActive.filter((c) => c.internalStatus === "ready").length,
      attention: allActive.filter((c) => waitingHours(c.updatedAt) >= STALE_HOURS).length,
    }),
    [allActive],
  );

  const chips = useMemo<FilterChip[]>(
    () =>
      CHIP_DEFS.map((c) => ({
        key: c.key,
        label: c.label,
        count: allActive.filter((x) => FILTERS[c.key](x.internalStatus)).length,
      })),
    [allActive],
  );

  const cases = useMemo(() => {
    const predicate = FILTERS[filter] ?? FILTERS.all;
    // Oldest-updated first so the longest-waiting cars surface at the top.
    let list = allActive
      .filter((c) => predicate(c.internalStatus))
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

    const q = search.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.vehicleNumber.toUpperCase().includes(q) ||
          c.caseNumber.toUpperCase().includes(q) ||
          (c.carModel ?? "").toUpperCase().includes(q),
      );
    }
    return list;
  }, [allActive, search, filter]);

  const openCase = useCallback((caseNumber: string) => {
    router.push({ pathname: "/(cases)/[caseNumber]", params: { caseNumber } });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: CaseListItem }) => <TechCaseRow item={item} onPress={openCase} />,
    [openCase],
  );

  return (
    <View style={styles.root}>
      <AppHeader
        title="Workshop"
        subtitle={`${greeting()}, ${user?.name?.split(" ")[0] ?? "Technician"}`}
        showBack={false}
        rightElement={
          <Pressable
            onPress={() => router.push("/(tabs)/settings")}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
          >
            <Feather name="settings" size={18} color={colors.primary} />
          </Pressable>
        }
      />

      {!casesQuery.isLoading && !casesQuery.isError && <WorkloadSummary stats={stats} />}

      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search plate, case #, model..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="characters"
          returnKeyType="search"
          accessibilityLabel="Search cases"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Clear search">
            <Feather name="x" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <StatusFilterChips chips={chips} active={filter} onSelect={setFilter} />

      {casesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : casesQuery.isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load cases</Text>
          <Pressable
            onPress={() => void casesQuery.refetch()}
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel="Retry loading cases"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={cases}
          keyExtractor={(item) => item.caseNumber}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          windowSize={11}
          removeClippedSubviews
          contentContainerStyle={[
            styles.list,
            { paddingBottom: tabBarHeight + 16 },
            cases.length === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={casesQuery.isRefetching}
              onRefresh={() => void casesQuery.refetch()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Feather name="check-circle" size={34} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {search ? "No matches" : filter !== "all" ? "Nothing here" : "All clear"}
              </Text>
              <Text style={styles.emptyText}>
                {search
                  ? "Try a different search term."
                  : filter !== "all"
                    ? "No cases in this filter right now."
                    : "No active cases right now."}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.primaryFaint,
  },

  errorText: { fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", color: colors.text, marginBottom: 12 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primaryFaint },
  retryText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const, color: colors.primary },

  searchWrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginTop: 12, marginBottom: 2,
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text, padding: 0,
  },

  list: { padding: 12, gap: 8 },
  listEmpty: { flexGrow: 1 },

  emptyBlock: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const, color: colors.text },
  emptyText: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", color: colors.textSecondary, textAlign: "center" },
});
