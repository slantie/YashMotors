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
import colors from "@/constants/colors";
import { fetchCases, type InternalStatus } from "@/services/cases";
import { useAuthStore } from "@/store/useAuthStore";

const STATUS_LABELS: Record<InternalStatus, string> = {
  intake: "Intake",
  in_progress: "In Progress",
  awaiting_parts: "Awaiting Parts",
  denting: "Denting",
  painting: "Painting",
  polishing: "Polishing",
  electrical: "Electrical",
  washing: "Washing",
  quality_check: "Quality Check",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<InternalStatus, string> = {
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
  delivered: "#6B7280",
  cancelled: "#EF4444",
};

const STATUS_ORDER: InternalStatus[] = [
  "intake", "in_progress", "awaiting_parts", "denting", "painting",
  "polishing", "electrical", "washing", "quality_check", "ready",
  "delivered", "cancelled",
];

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function ManagementScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const casesQuery = useQuery({ queryKey: ["cases"], queryFn: fetchCases });
  const all = casesQuery.data ?? [];

  const stats = useMemo(() => {
    const active = all.filter((c) => !["delivered", "cancelled"].includes(c.internalStatus));
    return {
      total: all.length,
      active: active.length,
      ready: all.filter((c) => c.internalStatus === "ready").length,
      deliveredToday: all.filter((c) => c.internalStatus === "delivered" && isToday(c.updatedAt)).length,
      cancelled: all.filter((c) => c.internalStatus === "cancelled").length,
    };
  }, [all]);

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<InternalStatus, number>> = {};
    for (const c of all) {
      counts[c.internalStatus] = (counts[c.internalStatus] ?? 0) + 1;
    }
    return counts;
  }, [all]);

  const advisorStats = useMemo(() => {
    const map: Record<string, { name: string; active: number; ready: number; total: number }> = {};
    for (const c of all) {
      const key = String(c.advisorId);
      const name = c.advisorName || `Advisor ${c.advisorId}`;
      if (!map[key]) map[key] = { name, active: 0, ready: 0, total: 0 };
      map[key].total++;
      if (!["delivered", "cancelled"].includes(c.internalStatus)) map[key].active++;
      if (c.internalStatus === "ready") map[key].ready++;
    }
    return Object.values(map).sort((a, b) => b.active - a.active);
  }, [all]);

  const maxActive = Math.max(...advisorStats.map((a) => a.active), 1);

  return (
    <View style={styles.root}>
      <AppHeader
        title="Management"
        subtitle={user?.name}
        showBack
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
        {casesQuery.isLoading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* ── Top stats ── */}
            <View style={styles.statsGrid}>
              <StatCard label="Total Cases" value={stats.total} icon="layers" color={colors.primary} />
              <StatCard label="Active" value={stats.active} icon="activity" color="#B54708" />
              <StatCard label="Ready" value={stats.ready} icon="check-circle" color={colors.success} />
              <StatCard label="Delivered Today" value={stats.deliveredToday} icon="truck" color={colors.textSecondary} />
            </View>

            {/* ── Status breakdown ── */}
            <SectionHeader title="Status Breakdown" />
            <View style={styles.card}>
              {STATUS_ORDER.map((status) => {
                const count = statusCounts[status] ?? 0;
                const pct = stats.total > 0 ? count / stats.total : 0;
                return (
                  <View key={status} style={styles.statusRow}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] }]} />
                    <Text style={styles.statusLabel}>{STATUS_LABELS[status]}</Text>
                    <View style={styles.statusBarWrap}>
                      <View
                        style={[
                          styles.statusBar,
                          { width: `${pct * 100}%`, backgroundColor: STATUS_COLORS[status] + "44" },
                        ]}
                      />
                    </View>
                    <Text style={styles.statusCount}>{count}</Text>
                  </View>
                );
              })}
            </View>

            {/* ── Advisor breakdown ── */}
            <SectionHeader title="Advisor Workload" />
            {advisorStats.length === 0 ? (
              <View style={[styles.card, styles.emptyBlock]}>
                <Text style={styles.emptyText}>No cases yet</Text>
              </View>
            ) : (
              <View style={styles.card}>
                {advisorStats.map((a, i) => (
                  <View key={i} style={[styles.advisorRow, i > 0 && styles.advisorBorder]}>
                    <View style={styles.advisorMeta}>
                      <View style={styles.advisorAvatar}>
                        <Text style={styles.avatarText}>{a.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={styles.advisorInfo}>
                        <Text style={styles.advisorName}>{a.name}</Text>
                        <Text style={styles.advisorSub}>
                          {a.active} active · {a.ready} ready · {a.total} total
                        </Text>
                      </View>
                    </View>
                    <View style={styles.advisorBarWrap}>
                      <View
                        style={[
                          styles.advisorBar,
                          { width: `${(a.active / maxActive) * 100}%` },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── Quick actions ── */}
            <SectionHeader title="Quick Actions" />
            <View style={styles.actionsRow}>
              <ActionBtn
                icon="folder"
                label="All Cases"
                onPress={() => router.push("/(cases)")}
              />
              <ActionBtn
                icon="bar-chart-2"
                label="Dashboard"
                onPress={() => router.push("/dashboard")}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function StatCard({
  label, value, icon, color,
}: {
  label: string; value: number; icon: string; color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon as "layers"} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionBtn({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.actionBtn}>
      <Feather name={icon as "folder"} size={18} color={colors.primary} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  loadingBlock: { paddingVertical: 48, alignItems: "center" },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.primaryFaint,
  },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    flex: 1, minWidth: "44%",
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statValue: { fontSize: 28, fontFamily: "Inter_700Bold", fontWeight: "700" as const, color: colors.text },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary },

  sectionTitle: {
    fontSize: 15, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const,
    color: colors.text, marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden",
  },

  statusRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  statusLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, width: 110 },
  statusBarWrap: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
  statusBar: { height: 6, borderRadius: 3 },
  statusCount: { fontSize: 13, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const, color: colors.text, width: 28, textAlign: "right" },

  advisorRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  advisorBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  advisorMeta: { flexDirection: "row", alignItems: "center", gap: 12 },
  advisorAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primaryFaint,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const, color: colors.primary },
  advisorInfo: { flex: 1 },
  advisorName: { fontSize: 14, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const, color: colors.text },
  advisorSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary, marginTop: 1 },
  advisorBarWrap: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
  advisorBar: { height: 5, backgroundColor: colors.primary + "88", borderRadius: 3 },

  actionsRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, paddingVertical: 14,
  },
  actionText: { fontSize: 14, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const, color: colors.primary },

  emptyBlock: { alignItems: "center", paddingVertical: 24 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary },
});
