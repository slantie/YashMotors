import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQueryClient } from "@tanstack/react-query";

import { AppHeader } from "@/components/AppHeader";
import { apiClient } from "@/lib/apiClient";
import colors from "@/constants/colors";
import { useAuthStore } from "@/store/useAuthStore";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  advisor: "Advisor",
  technician: "Technician",
};

function roleLabel(role?: string) {
  if (!role) return "Signed in";
  return ROLE_LABELS[role] ?? role.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export default function SettingsTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();
  const [clearingCache, setClearingCache] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [pinForm, setPinForm] = useState({ currentPin: "", newPin: "", confirmPin: "" });
  const [changingPin, setChangingPin] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    apiClient.get<{ avatarUrl?: string | null }>("/auth/me")
      .then((me) => { if (me.avatarUrl) setProfilePhoto(me.avatarUrl); })
      .catch(() => undefined);
  }, []);

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo access in Settings to set a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    const uri = result.assets[0].uri;
    setUploadingPhoto(true);
    try {
      const { key, uploadUrl } = await apiClient.post<{ key: string; uploadUrl: string }>(
        "/auth/avatar/presign",
        { contentType: "image/jpeg" }
      );

      const imgBlob = await fetch(uri).then((r) => r.blob());
      await fetch(uploadUrl, {
        method: "PUT",
        body: imgBlob,
        headers: { "Content-Type": "image/jpeg" },
      });

      const { avatarUrl } = await apiClient.post<{ avatarUrl: string }>(
        "/auth/avatar/confirm",
        { key }
      );

      setProfilePhoto(avatarUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Upload failed", "Could not save photo. Try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    Alert.alert("Remove Photo", "Remove your profile picture?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setProfilePhoto(null);
          await apiClient.delete("/auth/avatar").catch(() => undefined);
        },
      },
    ]);
  };

  const handleChangePin = async () => {
    const { currentPin, newPin, confirmPin } = pinForm;
    if (!currentPin || !newPin || !confirmPin) {
      Alert.alert("Error", "All fields are required.");
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      Alert.alert("Error", "New PIN must be exactly 4 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert("Error", "New PIN and confirm PIN do not match.");
      return;
    }
    setChangingPin(true);
    try {
      await apiClient.put("/auth/change-pin", { currentPin, newPin });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setChangePinOpen(false);
      Alert.alert("Success", "Your PIN has been changed.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to change PIN.");
    } finally {
      setChangingPin(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            await logout();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace("/login");
          },
        },
      ]
    );
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
            setClearingCache(true);
            queryClient.clear();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setClearingCache(false);
            Alert.alert("Done", "Cache cleared.");
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Settings" subtitle="Profile" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <Pressable onPress={handlePickPhoto} onLongPress={profilePhoto ? handleRemovePhoto : undefined} style={styles.avatarWrap} disabled={uploadingPhoto}>
            {profilePhoto ? (
              <View style={styles.avatarImgWrapper}>
                <Image source={{ uri: profilePhoto }} style={styles.avatarImg} contentFit="cover" />
              </View>
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() ?? "Y"}</Text>
              </View>
            )}
            <View style={[styles.avatarEditBadge, uploadingPhoto && { backgroundColor: colors.textMuted }]}>
              {uploadingPhoto
                ? <ActivityIndicator size={10} color="#fff" />
                : <Feather name="camera" size={11} color="#fff" />}
            </View>
          </Pressable>
          <Text style={styles.name}>{user?.name ?? "Yash Motors User"}</Text>
          <Text style={styles.role}>{roleLabel(user?.role)}</Text>
        </View>

        <View style={styles.card}>
          <InfoRow icon="phone" label="Mobile" value={user?.phone ?? "-"} />
          <InfoRow icon="shield" label="Role" value={roleLabel(user?.role)} />
          <InfoRow icon="hash" label="User ID" value={user?.id ? String(user.id) : "-"} />
        </View>

        <View style={styles.card}>
          {user?.role === "technician" ? (
            <ActionRow
              icon="activity"
              title="My Activity"
              subtitle="Cases you have worked on or updated"
              onPress={() => router.push("/technician-activity")}
            />
          ) : (
            <ActionRow
              icon="folder"
              title="Cases"
              subtitle="View service cases and status history"
              onPress={() => router.push({ pathname: "/(cases)" })}
            />
          )}
          <ActionRow
            icon="refresh-cw"
            title="Clear Cache"
            subtitle="Force-refetch all data on next load"
            onPress={handleClearCache}
            loading={clearingCache}
          />
          <ActionRow
            icon="lock"
            title="Change PIN"
            subtitle="Update your 4-digit access PIN"
            onPress={() => { setPinForm({ currentPin: "", newPin: "", confirmPin: "" }); setChangePinOpen(true); }}
          />
        </View>

        <View style={styles.card}>
          <InfoRow icon="info" label="App Version" value={Constants.expoConfig?.version ?? "—"} />
        </View>

        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Feather name="log-out" size={16} color={colors.destructive} />
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={changePinOpen} transparent animationType="slide" onRequestClose={() => setChangePinOpen(false)}>
        <KeyboardAvoidingView style={CHANGE_PIN_SHEET_STYLES.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={CHANGE_PIN_SHEET_STYLES.sheet}>
            <View style={CHANGE_PIN_SHEET_STYLES.sheetHandle} />
            <Text style={CHANGE_PIN_SHEET_STYLES.sheetTitle}>Change PIN</Text>
            <Text style={CHANGE_PIN_SHEET_STYLES.sheetSubtitle}>4 digits · numbers only</Text>

            <View style={CHANGE_PIN_SHEET_STYLES.fieldGroup}>
              <Text style={CHANGE_PIN_SHEET_STYLES.pinFieldLabel}>Current</Text>
              <TextInput
                value={pinForm.currentPin}
                onChangeText={(v) => setPinForm({ ...pinForm, currentPin: v })}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                style={CHANGE_PIN_SHEET_STYLES.pinInput}
              />
            </View>

            <View style={CHANGE_PIN_SHEET_STYLES.fieldGroup}>
              <Text style={CHANGE_PIN_SHEET_STYLES.pinFieldLabel}>New</Text>
              <TextInput
                value={pinForm.newPin}
                onChangeText={(v) => setPinForm({ ...pinForm, newPin: v })}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                style={CHANGE_PIN_SHEET_STYLES.pinInput}
              />
            </View>

            <View style={CHANGE_PIN_SHEET_STYLES.fieldGroup}>
              <Text style={CHANGE_PIN_SHEET_STYLES.pinFieldLabel}>Confirm</Text>
              <TextInput
                value={pinForm.confirmPin}
                onChangeText={(v) => setPinForm({ ...pinForm, confirmPin: v })}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                style={CHANGE_PIN_SHEET_STYLES.pinInput}
              />
            </View>

            <Pressable onPress={handleChangePin} disabled={changingPin} style={[CHANGE_PIN_SHEET_STYLES.saveBtn, changingPin && CHANGE_PIN_SHEET_STYLES.disabled]}>
              {changingPin ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={CHANGE_PIN_SHEET_STYLES.saveBtnText}>Update PIN</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setChangePinOpen(false)} style={CHANGE_PIN_SHEET_STYLES.sheetCancel}>
              <Text style={CHANGE_PIN_SHEET_STYLES.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  loading,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
      <View style={styles.infoIcon}>
        <Feather name={icon} size={15} color={colors.primary} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSub}>{subtitle}</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const CHANGE_PIN_SHEET_STYLES = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
    marginBottom: 20,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  pinFieldLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
    marginBottom: 6,
  },
  pinInput: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 22,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    letterSpacing: 10,
    textAlign: "center",
  },
  saveBtn: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  disabled: { opacity: 0.55 },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
  },
  sheetCancel: {
    alignItems: "center",
    paddingTop: 14,
  },
  sheetCancelText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
  },
});

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
  avatarWrap: {
    width: 72,
    height: 72,
    marginBottom: 12,
    position: "relative",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryFaint,
    borderWidth: 1,
    borderColor: colors.primary + "40",
  },
  avatarImgWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: colors.primary + "40",
    overflow: "hidden",
  },
  avatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarText: {
    fontSize: 27,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: colors.primary,
  },
  name: {
    fontSize: 19,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
  },
  role: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  actionTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  actionSub: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.destructive,
  },
});
