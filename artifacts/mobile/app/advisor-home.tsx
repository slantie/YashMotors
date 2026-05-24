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

function isToday(dateStr?: string) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function AdvisorHomeScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);

  const casesQuery = useQuery({
    queryKey: ["cases"],
    queryFn: fetchCases,
  });

  const myCases = useMemo(() => {
    const all = casesQuery.data ?? [];
    return all.filter((c) => Number(c.advisorId) === Number(user?.id));
  }, [casesQuery.data, user?.id]);

  const stats = useMemo(() => {
    const active = myCases.filter(
      (c) => !["delivered", "cancelled"].includes(c.internalStatus)
    );
    const dueToday = active.filter((c) => isToday(c.dueDate));
    const ready = myCases.filter((c) => c.internalStatus === "ready");
    const deliveredToday = myCases.filter(
      (c) => c.internalStatus === "delivered" && isToday(c.updatedAt)
    );
    return {
      active: active.length,
      dueToday: dueToday.length,
      ready: ready.length,
      deliveredToday: deliveredToday.length,
    };
  }, [myCases]);

  const recent = useMemo(
    () =>
      [...myCases]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [myCases]
  );

  return (
    <View style={styles.root}>
      <AppHeader
        title="Yash Motors"
        subtitle={`${greeting()}, ${user?.name?.split(" ")[0] ?? "Advisor"}`}
        rightElement={
          <Pressable onPress={() => router.push("/settings")} style={styles.iconBtn}>
            <Feather name="settings" size={18} color={colors.primary} />
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
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
        {/* Primary CTA */}
        <Pressable onPress={() => router.push("/intake")} style={styles.newJobBtn}>
          <View style={styles.newJobIcon}>
            <Feather name="plus" size={22} color="#fff" />
          </View>
          <View style={styles.newJobText}>
            <Text style={styles.newJobTitle}>New Job Card</Text>
            <Text style={styles.newJobSub}>Scan number plate & create case</Text>
          </View>
          <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* Stats */}
        {casesQuery.isLoading ? (
          <View style={styles.statsLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <StatCard label="My Active" value={stats.active} icon="briefcase" color={colors.primary} />
            <StatCard label="Due Today" value={stats.dueToday} icon="clock" color="#B54708" />
            <StatCard label="Ready" value={stats.ready} icon="check-circle" color={colors.success} />
            <StatCard label="Delivered Today" value={stats.deliveredToday} icon="truck" color={colors.textSecondary} />
          </View>
        )}

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <Pressable onPress={() => router.push("/(cases)")} style={styles.actionBtn}>
            <Feather name="folder" size={17} color={colors.primary} />
            <Text style={styles.actionText}>My Cases</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/settings")} style={styles.actionBtn}>
            <Feather name="settings" size={17} color={colors.primary} />
            <Text style={styles.actionText}>Settings</Text>
          </Pressable>
        </View>

        {/* Recent cases */}
        <Text style={styles.sectionTitle}>Recent Cases</Text>

        {casesQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.listLoading} />
        ) : recent.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Feather name="folder" size={28} color={colors.textMuted} />
            <Text style={styles.emptyText}>No cases yet</Text>
            <Text style={styles.emptySubText}>Create your first job card above</Text>
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
          <Pressable onPress={() => router.push("/(cases)")} style={styles.viewAllBtn}>
            <Text style={styles.viewAllText}>View All My Cases</Text>
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
        <Feather name={icon as "briefcase"} size={17} color={color} />
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
  newJobBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 18,
  },
  newJobIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  newJobText: { flex: 1 },
  newJobTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    color: "#fff",
  },
  newJobSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
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
    width: 34,
    height: 34,
    borderRadius: 9,
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
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  emptySubText: {
    fontSize: 13,
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
