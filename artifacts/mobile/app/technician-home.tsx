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
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { AppHeader } from "@/components/AppHeader";
import colors from "@/constants/colors";
import { fetchCases, type CaseListItem, type InternalStatus } from "@/services/cases";
import { useAuthStore } from "@/store/useAuthStore";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function waitingTime(updatedAt: string): string {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d`;
  if (hrs > 0) return `${hrs}h`;
  return "< 1h";
}

const ACTIVE_STATUSES: InternalStatus[] = [
  "intake", "in_progress", "awaiting_parts", "denting", "painting",
  "polishing", "electrical", "washing", "quality_check", "ready",
];

const STATUS_COLORS: Partial<Record<InternalStatus, string>> = {
  intake:        "#6366F1",
  in_progress:   "#B54708",
  awaiting_parts:"#C05621",
  denting:       "#7C3AED",
  painting:      "#0284C7",
  polishing:     "#0891B2",
  electrical:    "#D97706",
  washing:       "#059669",
  quality_check: "#8B5CF6",
  ready:         "#16A34A",
};

const STATUS_LABELS: Partial<Record<InternalStatus, string>> = {
  intake:        "Intake",
  in_progress:   "In Progress",
  awaiting_parts:"Awaiting Parts",
  denting:       "Denting",
  painting:      "Painting",
  polishing:     "Polishing",
  electrical:    "Electrical",
  washing:       "Washing",
  quality_check: "QC",
  ready:         "Ready",
};

const FILTER_CHIPS: { label: string; value: string | null }[] = [
  { label: "All", value: null },
  { label: "In Progress", value: "in_progress" },
  { label: "Awaiting Parts", value: "awaiting_parts" },
  { label: "Ready", value: "ready" },
];

export default function TechnicianHomeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const casesQuery = useQuery({ queryKey: ["cases"], queryFn: fetchCases });

  const allActive = useMemo(
    () => (casesQuery.data ?? []).filter((c) => ACTIVE_STATUSES.includes(c.internalStatus)),
    [casesQuery.data]
  );

  const summary = useMemo(() => ({
    total:    allActive.length,
    ready:    allActive.filter((c) => c.internalStatus === "ready").length,
    working:  allActive.filter((c) => ["in_progress", "denting", "painting", "polishing", "electrical", "washing", "quality_check"].includes(c.internalStatus)).length,
  }), [allActive]);

  const cases = useMemo(() => {
    let list = filterStatus
      ? allActive.filter((c) => c.internalStatus === filterStatus)
      : allActive;

    list = [...list].sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    );

    if (!search.trim()) return list;
    const q = search.trim().toUpperCase();
    return list.filter(
      (c) =>
        c.vehicleNumber.toUpperCase().includes(q) ||
        c.caseNumber.toUpperCase().includes(q) ||
        (c.carModel ?? "").toUpperCase().includes(q)
    );
  }, [allActive, search, filterStatus]);

  return (
    <View style={styles.root}>
      <AppHeader
        title="Workshop"
        subtitle={`${greeting()}, ${user?.name?.split(" ")[0] ?? "Technician"}`}
        showBack={false}
        rightElement={
          <Pressable onPress={() => router.push("/settings")} style={styles.iconBtn}>
            <Feather name="settings" size={18} color={colors.primary} />
          </Pressable>
        }
      />

      {/* Summary strip */}
      {!casesQuery.isLoading && (
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.summaryText}>{summary.total} active</Text>
          </View>
          <Text style={styles.summarySep}>·</Text>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryDot, { backgroundColor: "#B54708" }]} />
            <Text style={styles.summaryText}>{summary.working} in work</Text>
          </View>
          <Text style={styles.summarySep}>·</Text>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryDot, { backgroundColor: colors.success }]} />
            <Text style={styles.summaryText}>{summary.ready} ready</Text>
          </View>
        </View>
      )}

      {/* Search */}
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
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
        style={styles.chipsScroll}
      >
        {FILTER_CHIPS.map((chip) => (
          <Pressable
            key={chip.value ?? "all"}
            onPress={() => setFilterStatus(chip.value)}
            style={[styles.chip, filterStatus === chip.value && styles.chipActive]}
          >
            <Text style={[styles.chipText, filterStatus === chip.value && styles.chipTextActive]}>
              {chip.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {casesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : casesQuery.isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load cases</Text>
          <Pressable onPress={() => { void casesQuery.refetch(); }} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={cases}
          keyExtractor={(item) => item.caseNumber}
          renderItem={({ item }) => (
            <TechCaseRow
              item={item}
              onPress={() =>
                router.push({ pathname: "/(cases)/[caseNumber]", params: { caseNumber: item.caseNumber } })
              }
            />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: tabBarHeight + 16 },
            cases.length === 0 && styles.listEmpty,
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
            <View style={styles.emptyBlock}>
              <Feather name="check-circle" size={34} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {search ? "No matches" : filterStatus ? "No cases here" : "All clear"}
              </Text>
              <Text style={styles.emptyText}>
                {search
                  ? "Try a different search term."
                  : filterStatus
                  ? "Try a different filter."
                  : "No active cases right now."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function TechCaseRow({ item, onPress }: { item: CaseListItem; onPress: () => void }) {
  const color = STATUS_COLORS[item.internalStatus] ?? colors.textMuted;
  const label = STATUS_LABELS[item.internalStatus] ?? item.internalStatus;
  const wait = waitingTime(item.updatedAt);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderLeftColor: color }, pressed && styles.rowPressed]}
    >
      <View style={styles.rowLeft}>
        <View style={styles.caseNumRow}>
          <View style={[styles.caseNumBadge, { backgroundColor: color + "15", borderColor: color + "40" }]}>
            <Text style={[styles.caseNumText, { color }]}>{item.caseNumber}</Text>
          </View>
        </View>
        <Text style={styles.vehicleNum}>{item.vehicleNumber}</Text>
        <Text style={styles.carModel}>{item.carModel}</Text>
        {item.advisorName ? (
          <Text style={styles.advisorText}>{item.advisorName}</Text>
        ) : null}
      </View>
      <View style={styles.rowRight}>
        <View style={[styles.statusPill, { backgroundColor: color + "18", borderColor: color + "44" }]}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.statusText, { color }]}>{label}</Text>
        </View>
        <Text style={styles.waitText}>{wait} ago</Text>
        <Feather name="chevron-right" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
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

  summaryStrip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 8, gap: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  summaryItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  summaryDot: { width: 7, height: 7, borderRadius: 4 },
  summaryText: { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium", color: colors.textSecondary },
  summarySep: { fontSize: 12, color: colors.border, paddingHorizontal: 2 },

  errorText: { fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", color: colors.text, marginBottom: 12 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primaryFaint },
  retryText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const, color: colors.primary },

  searchWrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginTop: 10, marginBottom: 2,
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text, padding: 0,
  },

  chipsScroll: { maxHeight: 42 },
  chipsContainer: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  chip: {
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 7,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium", color: colors.textSecondary },
  chipTextActive: { color: "#fff" },

  list: { padding: 12, gap: 8 },
  listEmpty: { flexGrow: 1 },

  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    borderLeftWidth: 3,
    paddingVertical: 14, paddingHorizontal: 14, gap: 12,
  },
  rowPressed: { opacity: 0.75 },

  rowLeft: { flex: 1, gap: 3 },
  caseNumRow: { marginBottom: 3 },
  caseNumBadge: {
    alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  caseNumText: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const },

  vehicleNum: { fontSize: 17, fontFamily: "PlusJakartaSans_700Bold", fontWeight: "700" as const, color: colors.text },
  carModel: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", color: colors.textSecondary },
  advisorText: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", color: colors.textMuted, marginTop: 1 },

  rowRight: { alignItems: "flex-end", gap: 6 },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium" },
  waitText: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", color: colors.textMuted },

  emptyBlock: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const, color: colors.text },
  emptyText: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", color: colors.textSecondary, textAlign: "center" },
});
