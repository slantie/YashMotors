import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { AppHeader } from "@/components/AppHeader";
import { CaseCard } from "@/components/cases/CaseCard";
import colors from "@/constants/colors";
import { fetchCases, type CaseListItem } from "@/services/cases";
import { useAuthStore } from "@/store/useAuthStore";

type DateFilter = "all" | "today" | "tomorrow";
type SortOrder = "newest" | "oldest" | "due-asc";

function getDueDate(item: CaseListItem): Date | null {
  if (!item.dueDate || !item.createdAt) return null;
  const created = new Date(item.createdAt);
  if (item.dueDate === "today") return new Date(created);
  if (item.dueDate === "tomorrow") {
    const d = new Date(created);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (item.dueDate === "day-after") {
    const d = new Date(created);
    d.setDate(d.getDate() + 2);
    return d;
  }
  return null;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

export default function CasesScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const userId = user?.id;
  const canCreate =
    role === "superadmin" || role === "admin" || role === "advisor";

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [sortModalOpen, setSortModalOpen] = useState(false);

  const casesQuery = useQuery({
    queryKey: ["cases"],
    queryFn: () => fetchCases(),
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

    if (dateFilter !== "all") {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      all = all.filter((item) => {
        const due = getDueDate(item);
        if (!due) return false;
        if (dateFilter === "today") return isSameDay(due, today);
        if (dateFilter === "tomorrow") return isSameDay(due, tomorrow);
        return true;
      });
    }

    const sorted = [...all];
    if (sortOrder === "newest") {
      sorted.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } else if (sortOrder === "oldest") {
      sorted.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    } else if (sortOrder === "due-asc") {
      sorted.sort((a, b) => {
        const da = getDueDate(a);
        const db = getDueDate(b);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.getTime() - db.getTime();
      });
    }

    return sorted;
  })();

  const DATE_FILTERS: { id: DateFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "today", label: "Due Today" },
    { id: "tomorrow", label: "Due Tomorrow" },
  ];

  const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
    { id: "newest", label: "Newest First" },
    { id: "oldest", label: "Oldest First" },
    { id: "due-asc", label: "Due Date" },
  ];

  return (
    <View style={styles.root}>
      <AppHeader
        title="Cases"
        rightElement={
          canCreate ? (
            <Pressable
              onPress={() => router.push("/intake")}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Create new case"
              hitSlop={8}
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

      {/* Filter + Sort bar */}
      <View style={styles.filterRow}>
        <View style={styles.filterChips}>
          {DATE_FILTERS.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setDateFilter(f.id)}
              style={[
                styles.filterChip,
                dateFilter === f.id && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  dateFilter === f.id && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => setSortModalOpen(true)}
          style={styles.sortBtn}
        >
          <Feather name="sliders" size={14} color={colors.textSecondary} />
        </Pressable>
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
            { paddingBottom: tabBarHeight + 16 },
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
              <Text style={styles.emptyTitle}>
                {dateFilter !== "all"
                  ? "No cases match this filter"
                  : "No cases yet"}
              </Text>
              <Text style={styles.emptyText}>
                {dateFilter !== "all"
                  ? "Try a different date filter."
                  : role === "advisor"
                    ? "No cases have been assigned to you yet."
                    : "Create a case when a vehicle enters the workshop."}
              </Text>
            </View>
          }
        />
      )}

      {/* Sort modal */}
      <Modal
        visible={sortModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSortModalOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSortModalOpen(false)}
        />
        <View style={[styles.sortSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sortTitle}>Sort Cases</Text>
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => {
                setSortOrder(opt.id);
                setSortModalOpen(false);
              }}
              style={[
                styles.sortOption,
                sortOrder === opt.id && styles.sortOptionActive,
              ]}
            >
              <Text
                style={[
                  styles.sortOptionText,
                  sortOrder === opt.id && styles.sortOptionTextActive,
                ]}
              >
                {opt.label}
              </Text>
              {sortOrder === opt.id && (
                <Feather name="check" size={16} color={colors.primary} />
              )}
            </Pressable>
          ))}
        </View>
      </Modal>
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
    marginBottom: 8,
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
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 4,
    gap: 8,
  },
  filterChips: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  filterChipActive: {
    backgroundColor: colors.primaryFaint,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.primary,
  },
  sortBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
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
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sortSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  sortTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
    textAlign: "center",
    marginBottom: 16,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  sortOptionActive: {
    backgroundColor: colors.primaryFaint,
    paddingHorizontal: 10,
  },
  sortOptionText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text,
  },
  sortOptionTextActive: {
    color: colors.primary,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
});
