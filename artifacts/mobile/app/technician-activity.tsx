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
import { fetchTechnicianHistory, type CaseListItem, type InternalStatus } from "@/services/cases";

const STATUS_COLORS: Partial<Record<InternalStatus, string>> = {
  intake:         "#6366F1",
  in_progress:    "#B54708",
  awaiting_parts: "#C05621",
  denting:        "#7C3AED",
  painting:       "#0284C7",
  polishing:      "#0891B2",
  electrical:     "#D97706",
  washing:        "#059669",
  quality_check:  "#8B5CF6",
  ready:          "#16A34A",
  delivered:      colors.success,
  cancelled:      colors.textMuted,
};

const STATUS_LABELS: Partial<Record<InternalStatus, string>> = {
  intake:         "Intake",
  in_progress:    "In Progress",
  awaiting_parts: "Awaiting Parts",
  denting:        "Denting",
  painting:       "Painting",
  polishing:      "Polishing",
  electrical:     "Electrical",
  washing:        "Washing",
  quality_check:  "QC",
  ready:          "Ready",
  delivered:      "Delivered",
  cancelled:      "Cancelled",
};

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

export default function TechnicianActivityScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["technician-history"],
    queryFn: fetchTechnicianHistory,
  });

  const cases = useMemo(() => {
    const all = [...(query.data ?? [])].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    if (!search.trim()) return all;
    const q = search.trim().toUpperCase();
    return all.filter(
      (c) =>
        c.vehicleNumber.toUpperCase().includes(q) ||
        c.caseNumber.toUpperCase().includes(q) ||
        (c.carModel ?? "").toUpperCase().includes(q)
    );
  }, [query.data, search]);

  return (
    <View style={styles.root}>
      <AppHeader title="My Activity" subtitle="Workshop history" showBack />

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

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : query.isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load history</Text>
          <Pressable onPress={() => { void query.refetch(); }} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={cases}
          keyExtractor={(item) => item.caseNumber}
          renderItem={({ item }) => (
            <ActivityRow
              item={item}
              onPress={() =>
                router.push({ pathname: "/(cases)/[caseNumber]", params: { caseNumber: item.caseNumber } })
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
              refreshing={query.isRefetching}
              onRefresh={query.refetch}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Feather name="activity" size={34} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {search ? "No matches" : "No history yet"}
              </Text>
              <Text style={styles.emptyText}>
                {search
                  ? "Try a different search term."
                  : "Cases you interact with will appear here."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function ActivityRow({ item, onPress }: { item: CaseListItem; onPress: () => void }) {
  const color = STATUS_COLORS[item.internalStatus] ?? colors.textMuted;
  const label = STATUS_LABELS[item.internalStatus] ?? item.internalStatus;
  const isTerminal = item.internalStatus === "delivered" || item.internalStatus === "cancelled";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderLeftColor: color },
        isTerminal && styles.rowTerminal,
        pressed && styles.rowPressed,
      ]}
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
        <Text style={styles.timeText}>{timeAgo(item.updatedAt)}</Text>
        <Feather name="chevron-right" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },

  errorText: { fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", color: colors.text, marginBottom: 12 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primaryFaint },
  retryText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const, color: colors.primary },

  searchWrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginTop: 10, marginBottom: 8,
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text, padding: 0,
  },

  list: { paddingHorizontal: 12, paddingTop: 4, gap: 8 },
  listEmpty: { flexGrow: 1 },

  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    borderLeftWidth: 3,
    paddingVertical: 14, paddingHorizontal: 14, gap: 12,
  },
  rowTerminal: { opacity: 0.72 },
  rowPressed: { opacity: 0.6 },

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
  timeText: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", color: colors.textMuted },

  emptyBlock: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const, color: colors.text },
  emptyText: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", color: colors.textSecondary, textAlign: "center" },
});
