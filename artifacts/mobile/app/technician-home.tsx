import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
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
import colors from "@/constants/colors";
import { fetchCases, type CaseListItem, type InternalStatus } from "@/services/cases";
import { useAuthStore } from "@/store/useAuthStore";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function waitingTime(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
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
  intake: "#6366F1",
  in_progress: "#B54708",
  awaiting_parts: "#C05621",
  denting: "#7C3AED",
  painting: "#0284C7",
  polishing: "#0891B2",
  electrical: "#D97706",
  washing: "#059669",
  quality_check: "#8B5CF6",
  ready: "#16A34A",
};

const STATUS_LABELS: Partial<Record<InternalStatus, string>> = {
  intake: "Intake",
  in_progress: "In Progress",
  awaiting_parts: "Awaiting Parts",
  denting: "Denting",
  painting: "Painting",
  polishing: "Polishing",
  electrical: "Electrical",
  washing: "Washing",
  quality_check: "QC",
  ready: "Ready",
};

export default function TechnicianHomeScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");

  const casesQuery = useQuery({ queryKey: ["cases"], queryFn: fetchCases });

  const cases = useMemo(() => {
    const active = (casesQuery.data ?? []).filter((c) =>
      ACTIVE_STATUSES.includes(c.internalStatus)
    );
    active.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    if (!search.trim()) return active;
    const q = search.trim().toUpperCase();
    return active.filter(
      (c) =>
        c.vehicleNumber.toUpperCase().includes(q) ||
        c.carModel.toUpperCase().includes(q)
    );
  }, [casesQuery.data, search]);

  return (
    <View style={styles.root}>
      <AppHeader
        title="Workshop"
        subtitle={`${greeting()}, ${user?.name?.split(" ")[0] ?? "Technician"}`}
        rightElement={
          <Pressable onPress={() => router.push("/settings")} style={styles.iconBtn}>
            <Feather name="settings" size={18} color={colors.primary} />
          </Pressable>
        }
      />

      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search plate or model..."
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

      {casesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : casesQuery.isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load cases</Text>
          <Pressable onPress={casesQuery.refetch} style={styles.retryBtn}>
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
                {search ? "No matches" : "No active cases"}
              </Text>
              <Text style={styles.emptyText}>
                {search
                  ? "Try a different search term."
                  : "All vehicles have been delivered."}
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
  const wait = waitingTime(item.createdAt);

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowLeft}>
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
        <Text style={styles.waitText}>{wait} waiting</Text>
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
  errorText: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text, marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.primaryFaint,
  },
  retryText: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const, color: colors.primary,
  },
  searchWrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: "Inter_400Regular",
    color: colors.text, padding: 0,
  },
  list: { padding: 16, gap: 8 },
  listEmpty: { flexGrow: 1 },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14, paddingHorizontal: 14, gap: 12,
  },
  rowLeft: { flex: 1, gap: 3 },
  vehicleNum: {
    fontSize: 17, fontFamily: "Inter_700Bold", fontWeight: "700" as const, color: colors.text,
  },
  carModel: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary },
  advisorText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 1 },
  rowRight: { alignItems: "flex-end", gap: 6 },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  waitText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted },
  emptyBlock: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const, color: colors.text,
  },
  emptyText: {
    fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary, textAlign: "center",
  },
});
