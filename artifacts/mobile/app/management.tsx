import { Feather } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Rect, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

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
  "intake",
  "in_progress",
  "awaiting_parts",
  "denting",
  "painting",
  "polishing",
  "electrical",
  "washing",
  "quality_check",
  "ready",
  "delivered",
  "cancelled",
];

function fmtDisplay(d: Date | null): string {
  if (!d) return "...";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isToday(dateStr: string): boolean {
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
  const tabBarHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();
  const user = useAuthStore((s) => s.user);

  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [iosPickerTarget, setIosPickerTarget] = useState<"from" | "to" | null>(
    null,
  );
  const [iosTempDate, setIosTempDate] = useState(new Date());

  const casesQuery = useQuery({ queryKey: ["cases"], queryFn: fetchCases });
  const all = casesQuery.data ?? [];

  const openDatePicker = (which: "from" | "to") => {
    const current =
      which === "from" ? (dateFrom ?? new Date()) : (dateTo ?? new Date());
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        maximumDate: which === "from" ? (dateTo ?? undefined) : undefined,
        minimumDate: which === "to" ? (dateFrom ?? undefined) : undefined,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === "set" && date) {
            if (which === "from") setDateFrom(date);
            else setDateTo(date);
          }
        },
      });
    } else {
      setIosTempDate(current);
      setIosPickerTarget(which);
    }
  };

  const confirmIosPicker = () => {
    if (iosPickerTarget === "from") setDateFrom(iosTempDate);
    else if (iosPickerTarget === "to") setDateTo(iosTempDate);
    setIosPickerTarget(null);
  };

  const clearDateFilter = () => {
    setDateFrom(null);
    setDateTo(null);
  };

  const hasDateFilter = dateFrom !== null || dateTo !== null;

  const filtered = useMemo(() => {
    let result = all;
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter((c) => new Date(c.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((c) => new Date(c.createdAt) <= to);
    }
    return result;
  }, [all, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const active = filtered.filter(
      (c) => !["delivered", "cancelled"].includes(c.internalStatus),
    ).length;
    const ready = filtered.filter(
      (c) => c.internalStatus === "ready",
    ).length;
    const deliveredToday = filtered.filter(
      (c) => c.internalStatus === "delivered" && isToday(c.updatedAt),
    ).length;
    return { total, active, ready, deliveredToday };
  }, [filtered]);

  const donutSlices = useMemo(() => {
    const inWork = filtered.filter(
      (c) => !["delivered", "cancelled", "ready"].includes(c.internalStatus),
    ).length;
    const ready = filtered.filter((c) => c.internalStatus === "ready").length;
    const delivered = filtered.filter(
      (c) => c.internalStatus === "delivered",
    ).length;
    const cancelled = filtered.filter(
      (c) => c.internalStatus === "cancelled",
    ).length;
    return [
      { label: "In Work", value: inWork, color: "#B54708" },
      { label: "Ready", value: ready, color: colors.success },
      { label: "Delivered", value: delivered, color: "#6B7280" },
      { label: "Cancelled", value: cancelled, color: "#EF4444" },
    ];
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<InternalStatus, number>> = {};
    for (const c of filtered) {
      counts[c.internalStatus] = (counts[c.internalStatus] ?? 0) + 1;
    }
    return counts;
  }, [filtered]);

  const advisorStats = useMemo(() => {
    const map: Record<
      string,
      { name: string; inWork: number; ready: number; active: number; total: number }
    > = {};
    for (const c of filtered) {
      const key = String(c.advisorId);
      const name = c.advisorName || `Advisor ${c.advisorId}`;
      if (!map[key])
        map[key] = { name, inWork: 0, ready: 0, active: 0, total: 0 };
      map[key].total++;
      if (!["delivered", "cancelled"].includes(c.internalStatus)) {
        map[key].active++;
        if (c.internalStatus === "ready") map[key].ready++;
        else map[key].inWork++;
      }
    }
    return Object.values(map).sort((a, b) => b.active - a.active);
  }, [filtered]);

  const weeklyIntake = useMemo(() => {
    const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    const days: { label: string; isoDate: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        label: DAYS[d.getDay()],
        isoDate: d.toISOString().slice(0, 10),
        count: 0,
      });
    }
    for (const c of all) {
      const isoDate = c.createdAt.slice(0, 10);
      const day = days.find((d) => d.isoDate === isoDate);
      if (day) day.count++;
    }
    return days;
  }, [all]);

  // card inner width: screen - 2*16 padding - 2*14 card padding
  const chartWidth = width - 32 - 28;

  return (
    <View style={styles.root}>
      <AppHeader
        title="Management"
        subtitle={user?.name}
        showBack
        rightElement={
          <Pressable
            onPress={() => router.push("/(tabs)/settings")}
            style={styles.iconBtn}
          >
            <Feather name="settings" size={18} color={colors.primary} />
          </Pressable>
        }
      />

      {/* Date filter bar */}
      <Pressable
        onPress={() => setShowDateFilter((v) => !v)}
        style={styles.filterToggle}
      >
        <Feather name="calendar" size={14} color={colors.primary} />
        <Text style={styles.filterToggleText}>
          {hasDateFilter
            ? `${fmtDisplay(dateFrom)} — ${fmtDisplay(dateTo)}`
            : "Filter by date range"}
        </Text>
        {hasDateFilter && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              clearDateFilter();
            }}
            hitSlop={8}
          >
            <Feather name="x" size={14} color={colors.destructive} />
          </Pressable>
        )}
        <Feather
          name={showDateFilter ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.textMuted}
        />
      </Pressable>

      {showDateFilter && (
        <View style={styles.dateFilterPane}>
          <View style={styles.dateFieldRow}>
            <Pressable
              onPress={() => openDatePicker("from")}
              style={styles.dateBtn}
            >
              <Feather name="calendar" size={13} color={colors.primary} />
              <View>
                <Text style={styles.dateBtnLabel}>FROM</Text>
                <Text
                  style={[
                    styles.dateBtnValue,
                    !dateFrom && styles.dateBtnPlaceholder,
                  ]}
                >
                  {dateFrom ? fmtDisplay(dateFrom) : "Select date"}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => openDatePicker("to")}
              style={styles.dateBtn}
            >
              <Feather name="calendar" size={13} color={colors.primary} />
              <View>
                <Text style={styles.dateBtnLabel}>TO</Text>
                <Text
                  style={[
                    styles.dateBtnValue,
                    !dateTo && styles.dateBtnPlaceholder,
                  ]}
                >
                  {dateTo ? fmtDisplay(dateTo) : "Select date"}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      )}

      {/* iOS picker modal */}
      {Platform.OS === "ios" && iosPickerTarget !== null && (
        <Modal
          transparent
          animationType="slide"
          onRequestClose={() => setIosPickerTarget(null)}
        >
          <View style={styles.iosBackdrop}>
            <View style={styles.iosSheet}>
              <View style={styles.iosHandle} />
              <Text style={styles.iosTitle}>
                {iosPickerTarget === "from" ? "From Date" : "To Date"}
              </Text>
              <DateTimePicker
                value={iosTempDate}
                mode="date"
                display="spinner"
                maximumDate={
                  iosPickerTarget === "from" ? (dateTo ?? undefined) : undefined
                }
                minimumDate={
                  iosPickerTarget === "to"
                    ? (dateFrom ?? undefined)
                    : undefined
                }
                onChange={(_: DateTimePickerEvent, date?: Date) => {
                  if (date) setIosTempDate(date);
                }}
              />
              <Pressable onPress={confirmIosPicker} style={styles.iosDoneBtn}>
                <Text style={styles.iosDoneText}>Done</Text>
              </Pressable>
              <Pressable
                onPress={() => setIosPickerTarget(null)}
                style={styles.iosCancelBtn}
              >
                <Text style={styles.iosCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarHeight + 16 },
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
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* ── 2×2 StatCards ── */}
            <View style={styles.statsGrid}>
              <StatCard
                label="Total Cases"
                value={stats.total}
                icon="layers"
                color={colors.primary}
              />
              <StatCard
                label="Active"
                value={stats.active}
                icon="activity"
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

            {/* ── Advisor Workload ── */}
            <SectionHeader title="Advisor Workload" />
            {advisorStats.length === 0 ? (
              <View style={[styles.card, styles.emptyBlock]}>
                <Text style={styles.emptyText}>No advisor data</Text>
              </View>
            ) : (
              <View style={styles.card}>
                {advisorStats.map((a, i) => (
                  <View
                    key={i}
                    style={[styles.advisorRow, i > 0 && styles.advisorBorder]}
                  >
                    <View style={styles.advisorMeta}>
                      <View style={styles.advisorAvatar}>
                        <Text style={styles.avatarText}>
                          {a.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.advisorInfo}>
                        <Text style={styles.advisorName}>{a.name}</Text>
                        <View style={styles.advisorTagRow}>
                          {a.inWork > 0 && (
                            <View
                              style={[
                                styles.advisorTag,
                                { backgroundColor: "#B54708" + "18" },
                              ]}
                            >
                              <View
                                style={[
                                  styles.tagDot,
                                  { backgroundColor: "#B54708" },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.advisorTagText,
                                  { color: "#B54708" },
                                ]}
                              >
                                {a.inWork} working
                              </Text>
                            </View>
                          )}
                          {a.ready > 0 && (
                            <View
                              style={[
                                styles.advisorTag,
                                { backgroundColor: colors.success + "18" },
                              ]}
                            >
                              <View
                                style={[
                                  styles.tagDot,
                                  { backgroundColor: colors.success },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.advisorTagText,
                                  { color: colors.success },
                                ]}
                              >
                                {a.ready} ready
                              </Text>
                            </View>
                          )}
                          <Text style={styles.advisorTotal}>
                            {a.total} total
                          </Text>
                        </View>
                      </View>
                    </View>
                    {/* Stacked bar: inWork (orange) + ready (green) + terminal (bg) */}
                    <View style={styles.advisorBarTrack}>
                      {a.total > 0 && (
                        <>
                          {a.inWork > 0 && (
                            <View
                              style={{
                                flex: a.inWork,
                                backgroundColor: "#B54708" + "CC",
                              }}
                            />
                          )}
                          {a.ready > 0 && (
                            <View
                              style={{
                                flex: a.ready,
                                backgroundColor: colors.success + "CC",
                              }}
                            />
                          )}
                          {a.total - a.active > 0 && (
                            <View
                              style={{
                                flex: a.total - a.active,
                                backgroundColor: "transparent",
                              }}
                            />
                          )}
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── Case Distribution ── */}
            <SectionHeader title="Case Distribution" />
            <View style={styles.card}>
              <DonutChart slices={donutSlices} total={stats.total} />
            </View>

            {/* ── Weekly Intake ── */}
            <SectionHeader title="Weekly Intake" />
            <View style={styles.card}>
              <WeeklyBarChart data={weeklyIntake} chartWidth={chartWidth} />
            </View>

            {/* ── Status Breakdown ── */}
            <SectionHeader title="Status Breakdown" />
            <View style={styles.card}>
              {STATUS_ORDER.map((status) => {
                const count = statusCounts[status] ?? 0;
                const pct = stats.total > 0 ? count / stats.total : 0;
                return (
                  <View key={status} style={styles.statusRow}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: STATUS_COLORS[status] },
                      ]}
                    />
                    <Text style={styles.statusLabel}>
                      {STATUS_LABELS[status]}
                    </Text>
                    <View style={styles.statusBarWrap}>
                      <View
                        style={[
                          styles.statusBar,
                          {
                            width: `${pct * 100}%`,
                            backgroundColor: STATUS_COLORS[status] + "55",
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.statusCount}>{count}</Text>
                  </View>
                );
              })}
            </View>

            {/* ── Quick Actions ── */}
            <SectionHeader title="Quick Actions" />
            <View style={styles.actionsRow}>
              <ActionBtn
                icon="folder"
                label="All Cases"
                onPress={() => router.push("/(tabs)/cases")}
              />
              <ActionBtn
                icon="home"
                label="Dashboard"
                onPress={() => router.push("/(tabs)")}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────

const DONUT_R = 46;
const DONUT_CX = 60;
const DONUT_CY = 60;
const DONUT_STROKE = 14;
const DONUT_C = 2 * Math.PI * DONUT_R;

function DonutChart({
  slices,
  total,
}: {
  slices: { label: string; value: number; color: string }[];
  total: number;
}) {
  let cumPct = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const pct = s.value / total;
      const dashLen = pct * DONUT_C;
      const rotation = cumPct * 360 - 90;
      cumPct += pct;
      return (
        <Circle
          key={i}
          cx={DONUT_CX}
          cy={DONUT_CY}
          r={DONUT_R}
          fill="none"
          stroke={s.color}
          strokeWidth={DONUT_STROKE}
          strokeDasharray={`${dashLen} ${DONUT_C - dashLen}`}
          strokeLinecap="butt"
          transform={`rotate(${rotation}, ${DONUT_CX}, ${DONUT_CY})`}
        />
      );
    });

  return (
    <View style={styles.donutContainer}>
      <View style={{ width: 120, height: 120 }}>
        <Svg width={120} height={120} style={StyleSheet.absoluteFill}>
          <Circle
            cx={DONUT_CX}
            cy={DONUT_CY}
            r={DONUT_R}
            fill="none"
            stroke={colors.border}
            strokeWidth={DONUT_STROKE}
          />
          {total > 0 ? arcs : null}
        </Svg>
        <View
          style={[
            StyleSheet.absoluteFill,
            { alignItems: "center", justifyContent: "center" },
          ]}
        >
          <Text style={styles.donutCenterVal}>{total}</Text>
          <Text style={styles.donutCenterSub}>total</Text>
        </View>
      </View>

      <View style={styles.donutLegend}>
        {slices.map((s, i) => (
          <View key={i} style={styles.donutLegendRow}>
            <View
              style={[styles.donutLegendDot, { backgroundColor: s.color }]}
            />
            <Text style={styles.donutLegendLabel}>{s.label}</Text>
            <Text style={[styles.donutLegendVal, { color: s.color }]}>
              {s.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function WeeklyBarChart({
  data,
  chartWidth,
}: {
  data: { label: string; count: number }[];
  chartWidth: number;
}) {
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const CHART_H = 72;
  const CHART_Y = 8;
  const SVG_H = 110;
  const N = data.length;
  const groupW = chartWidth / N;
  const barW = Math.min(groupW * 0.55, 26);

  return (
    <View style={{ padding: 14, paddingBottom: 10 }}>
      <Svg width={chartWidth} height={SVG_H}>
        {data.map((d, i) => {
          const barH =
            d.count > 0 ? Math.max((d.count / maxVal) * CHART_H, 4) : 0;
          const x = i * groupW + (groupW - barW) / 2;
          const y = CHART_Y + CHART_H - barH;
          const isLast = i === data.length - 1;
          return (
            <React.Fragment key={i}>
              <Rect
                x={x}
                y={CHART_Y}
                width={barW}
                height={CHART_H}
                rx={4}
                fill={colors.border + "88"}
              />
              {barH > 0 && (
                <Rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={4}
                  fill={isLast ? colors.primary : colors.primary + "88"}
                />
              )}
              <SvgText
                x={x + barW / 2}
                y={CHART_Y + CHART_H + 16}
                textAnchor="middle"
                fontSize={11}
                fill={isLast ? colors.primary : (colors.textMuted as string)}
                fontFamily="PlusJakartaSans_500Medium"
              >
                {d.label}
              </SvgText>
              {d.count > 0 && (
                <SvgText
                  x={x + barW / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill={colors.primary as string}
                  fontFamily="PlusJakartaSans_600SemiBold"
                >
                  {d.count}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
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
        <Feather name={icon as "layers"} size={26} color={color} />
      </View>
      <View style={[styles.statInfo, { flex: 1 }]}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.75 }]}
    >
      <Feather name={icon as "folder"} size={18} color={colors.primary} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  loadingBlock: { paddingVertical: 48, alignItems: "center" },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryFaint,
  },

  // Date filter
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  filterToggleText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.text,
  },
  dateFilterPane: {
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  dateFieldRow: { flexDirection: "row", gap: 10 },
  dateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateBtnLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  dateBtnValue: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  dateBtnPlaceholder: { color: colors.textMuted },

  // iOS picker modal
  iosBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  iosSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  iosHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  iosTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  iosDoneBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  iosDoneText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
  },
  iosCancelBtn: { alignItems: "center", paddingTop: 12 },
  iosCancelText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
  },

  // StatCards — matches dashboard/advisor-home style
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
    alignItems: "center",
    justifyContent: "center",
  },
  statInfo: { alignItems: "flex-end" },
  statLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    marginBottom: 2,
    textAlign: "right",
  },
  statValue: {
    fontSize: 24,
    lineHeight: 28,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },

  sectionTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },

  // Advisor workload
  advisorRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  advisorBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  advisorMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  advisorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryFaint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
  advisorInfo: { flex: 1 },
  advisorName: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    marginBottom: 4,
  },
  advisorTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  advisorTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  advisorTagText: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium" },
  advisorTotal: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
  },
  advisorBarTrack: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: colors.border,
  },

  // Donut chart
  donutContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 20,
  },
  donutCenterVal: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
    textAlign: "center",
  },
  donutCenterSub: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
    textAlign: "center",
  },
  donutLegend: { flex: 1, gap: 8 },
  donutLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  donutLegendDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  donutLegendLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text,
  },
  donutLegendVal: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },

  // Status breakdown
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  statusLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text,
    width: 112,
  },
  statusBarWrap: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  statusBar: { height: 6, borderRadius: 3 },
  statusCount: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    width: 28,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },

  // Quick actions
  actionsRow: { flexDirection: "row", gap: 10 },
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },

  emptyBlock: { alignItems: "center", paddingVertical: 24 },
  emptyText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
  },
});
