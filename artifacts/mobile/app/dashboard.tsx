import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { fetchCases } from "@/services/cases";
import { useAuthStore } from "@/store/useAuthStore";

const WORKING_STATUSES = [
  "in_progress",
  "awaiting_parts",
  "denting",
  "painting",
  "polishing",
  "electrical",
  "washing",
  "quality_check",
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState("");
  const isSearching = search.trim().length > 0;

  const casesQuery = useQuery({ queryKey: ["cases"], queryFn: fetchCases });
  const allCases = casesQuery.data ?? [];

  const stats = useMemo(
    () => ({
      active: allCases.filter((c) =>
        WORKING_STATUSES.includes(c.internalStatus),
      ).length,
      pending: allCases.filter((c) => c.internalStatus === "intake").length,
      ready: allCases.filter((c) => c.internalStatus === "ready").length,
      completed: allCases.filter((c) => c.internalStatus === "delivered")
        .length,
    }),
    [allCases],
  );

  const recent = useMemo(
    () =>
      [...allCases]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5),
    [allCases],
  );

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = search.trim().toUpperCase();
    return [...allCases]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .filter(
        (c) =>
          c.vehicleNumber.toUpperCase().includes(q) ||
          c.caseNumber.toUpperCase().includes(q) ||
          (c.carModel ?? "").toUpperCase().includes(q) ||
          (c.advisorName ?? "").toUpperCase().includes(q),
      );
  }, [allCases, search, isSearching]);

  return (
    <View style={styles.root}>
      <AppHeader
        title="Dashboard"
        subtitle={`${greeting()}, ${user?.name?.split(" ")[0] ?? "Admin"}`}
      />

      {/* Search — always visible, outside scroll */}
      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search plate, case #, advisor..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="characters"
          returnKeyType="search"
        />
        {isSearching && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {isSearching ? (
        /* ── Search results mode ── */
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.caseNumber}
          renderItem={({ item }) => (
            <CaseCard
              item={item}
              showAdvisor
              onPress={() =>
                router.push({
                  pathname: "/(cases)/[caseNumber]",
                  params: { caseNumber: item.caseNumber },
                })
              }
            />
          )}
          contentContainerStyle={[
            styles.resultsList,
            { paddingBottom: insets.bottom + 24 },
            searchResults.length === 0 && styles.resultsEmpty,
          ]}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Feather name="search" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>No matches found</Text>
            </View>
          }
        />
      ) : (
        /* ── Home mode ── */
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={casesQuery.isRefetching}
              onRefresh={casesQuery.refetch}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {casesQuery.isLoading ? (
            <View style={styles.statsLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.statsGrid}>
              <StatCard
                label="Active"
                value={stats.active}
                icon="tool"
                color="#B54708"
                onPress={() => router.push("/(tabs)/cases")}
              />
              <StatCard
                label="Pending"
                value={stats.pending}
                icon="clock"
                color="#6366F1"
                onPress={() => router.push("/(tabs)/cases")}
              />
              <StatCard
                label="Ready"
                value={stats.ready}
                icon="check-circle"
                color={colors.success}
                onPress={() => router.push("/(tabs)/cases")}
              />
              <StatCard
                label="Delivered"
                value={stats.completed}
                icon="truck"
                color={colors.textMuted}
                onPress={() => router.push("/(tabs)/cases")}
              />
            </View>
          )}

          <View style={styles.ctaRow}>
            <Pressable
              onPress={() => router.push("/(tabs)/cases")}
              style={({ pressed }) => [
                styles.ctaBtn,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Feather name="folder" size={18} color={colors.primary} />
              <Text style={styles.ctaBtnText}>All Cases</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)/management")}
              style={({ pressed }) => [
                styles.ctaBtn,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Feather name="bar-chart-2" size={18} color={colors.primary} />
              <Text style={styles.ctaBtnText}>Management</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Cases</Text>
            <Pressable onPress={() => router.push("/(tabs)/cases")}>
              <Text style={styles.sectionLink}>See all</Text>
            </Pressable>
          </View>

          {casesQuery.isLoading ? (
            <ActivityIndicator
              color={colors.primary}
              style={styles.listLoading}
            />
          ) : recent.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Feather name="folder" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>No cases yet</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {recent.map((item) => (
                <CaseCard
                  key={item.caseNumber}
                  item={item}
                  showAdvisor
                  onPress={() =>
                    router.push({
                      pathname: "/(cases)/[caseNumber]",
                      params: { caseNumber: item.caseNumber },
                    })
                  }
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  onPress,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.78 }]}
    >
      <View
        style={[
          styles.statIcon,
          {
            backgroundColor: color + "18",
            width: 48,
            height: 48,
            borderRadius: 12,
          },
        ]}
      >
        <Feather name={icon as "tool"} size={26} color={color} />
      </View>
      <View style={[styles.statInfo, { flex: 1 }]}>
        <Text style={[styles.statLabel, { marginBottom: 2 }]}>{label}</Text>
        <Text
          style={[styles.statValue, { color, fontSize: 24, lineHeight: 28 }]}
        >
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text,
    padding: 0,
  },

  resultsList: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  resultsEmpty: { flexGrow: 1 },

  statsLoading: { paddingVertical: 32, alignItems: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    flex: 1,
    minWidth: "44%",
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  statIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statInfo: { flex: 1, alignItems: "flex-end" },
  statLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    marginBottom: 2,
    textAlign: "right",
  },
  statValue: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },

  ctaRow: { flexDirection: "row", gap: 10 },
  ctaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
  },
  ctaBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  sectionLink: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.primary,
  },

  listLoading: { paddingVertical: 24 },
  emptyBlock: { alignItems: "center", paddingVertical: 36, gap: 8 },
  emptyText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
});
