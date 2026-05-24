import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { CaseCard } from "@/components/cases/CaseCard";
import colors from "@/constants/colors";
import { fetchCases } from "@/services/cases";
import { useAuthStore } from "@/store/useAuthStore";

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);

  const casesQuery = useQuery({
    queryKey: ["cases"],
    queryFn: fetchCases,
  });

  const cases = casesQuery.data ?? [];

  const stats = useMemo(() => {
    const active = cases.filter(
      (c) => !["delivered", "cancelled"].includes(c.internalStatus)
    );
    const ready = cases.filter((c) => c.internalStatus === "ready");
    const inRepair = cases.filter((c) => c.internalStatus === "in_progress");
    const deliveredToday = cases.filter(
      (c) => c.internalStatus === "delivered" && isToday(c.updatedAt)
    );
    return {
      total: active.length,
      ready: ready.length,
      inRepair: inRepair.length,
      deliveredToday: deliveredToday.length,
    };
  }, [cases]);

  const recent = useMemo(
    () =>
      [...cases]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        .slice(0, 6),
    [cases]
  );

  return (
    <View style={styles.root}>
      <AppHeader
        title="Dashboard"
        subtitle={user?.name}
        rightElement={
          <Pressable
            onPress={() => router.push("/settings")}
            style={styles.iconBtn}
          >
            <Feather name="settings" size={18} color={colors.primary} />
          </Pressable>
        }
      />
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
      >
        {casesQuery.isLoading ? (
          <View style={styles.statsLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <StatCard
              label="Active Cases"
              value={stats.total}
              icon="briefcase"
              color={colors.primary}
            />
            <StatCard
              label="In Repair"
              value={stats.inRepair}
              icon="tool"
              color="#B54708"
            />
            <StatCard
              label="Ready"
              value={stats.ready}
              icon="check-circle"
              color={colors.success}
            />
            <StatCard
              label="Delivered Today"
              value={stats.deliveredToday}
              icon="truck"
              color={colors.textSecondary}
            />
          </View>
        )}

        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => router.push("/(cases)")}
            style={styles.actionBtn}
          >
            <Feather name="folder" size={18} color={colors.primary} />
            <Text style={styles.actionText}>All Cases</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/management")}
            style={styles.actionBtn}
          >
            <Feather name="bar-chart-2" size={18} color={colors.primary} />
            <Text style={styles.actionText}>Management</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/settings")}
            style={styles.actionBtn}
          >
            <Feather name="settings" size={18} color={colors.primary} />
            <Text style={styles.actionText}>Settings</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Recent Cases</Text>

        {casesQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.listLoading} />
        ) : recent.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Feather name="folder" size={28} color={colors.textMuted} />
            <Text style={styles.emptyText}>No cases yet</Text>
          </View>
        ) : (
          recent.map((item) => (
            <CaseCard
              key={item.caseNumber}
              item={item}
              onPress={() =>
                router.push({
                  pathname: "/(cases)/[caseNumber]",
                  params: { caseNumber: item.caseNumber },
                })
              }
            />
          ))
        )}

        {recent.length > 0 && (
          <Pressable
            onPress={() => router.push("/(cases)")}
            style={styles.viewAllBtn}
          >
            <Text style={styles.viewAllText}>View All Cases</Text>
            <Feather name="arrow-right" size={14} color={colors.primary} />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon as "briefcase"} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryFaint,
  },
  statsLoading: { paddingVertical: 32, alignItems: "center" },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: "44%",
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
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
  actionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    marginTop: 4,
  },
  listLoading: { paddingVertical: 24 },
  emptyBlock: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },
  viewAllText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
});
