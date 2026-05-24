import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { AppHeader } from "@/components/AppHeader";
import colors from "@/constants/colors";
import { useAuthStore } from "@/store/useAuthStore";

function roleLabel(role?: string) {
  if (!role) return "Signed in";
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await logout();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/login");
  };

  const handleClearCache = () => {
    Alert.alert(
      "Clear Cache",
      "Clears all cached data and local flags. The app will refetch fresh data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            queryClient.clear();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Done", "Cache cleared.");
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Settings" subtitle="Profile" showBack />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() ?? "Y"}</Text>
          </View>
          <Text style={styles.name}>{user?.name ?? "Yash Motors User"}</Text>
          <Text style={styles.role}>{roleLabel(user?.role)}</Text>
        </View>

        <View style={styles.card}>
          <InfoRow icon="phone" label="Mobile" value={user?.phone ?? "-"} />
          <InfoRow icon="shield" label="Role" value={roleLabel(user?.role)} />
          <InfoRow icon="hash" label="User ID" value={user?.id ? String(user.id) : "-"} />
        </View>

        <View style={styles.card}>
          <ActionRow
            icon="folder"
            title="Cases"
            subtitle="View service cases and status history"
            onPress={() => router.push({ pathname: "/(cases)" })}
          />
          <ActionRow
            icon="refresh-cw"
            title="Clear Cache"
            subtitle="Force-refetch all data on next load"
            onPress={handleClearCache}
          />
        </View>

        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Feather name="log-out" size={16} color={colors.destructive} />
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Feather name={icon} size={15} color={colors.primary} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
      <View style={styles.infoIcon}>
        <Feather name={icon} size={15} color={colors.primary} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSub}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  profileCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryFaint,
    borderWidth: 1,
    borderColor: colors.primary + "40",
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 27,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    color: colors.primary,
  },
  name: {
    fontSize: 19,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
  },
  role: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: colors.textSecondary,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  pressed: { opacity: 0.72 },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryFaint,
  },
  infoText: { flex: 1 },
  infoLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  actionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  actionSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEF3F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECDCA",
    paddingVertical: 14,
  },
  logoutText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.destructive,
  },
});
