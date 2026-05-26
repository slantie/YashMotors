import { Feather } from "@expo/vector-icons";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import colors from "@/constants/colors";
import { useAuthStore } from "@/store/useAuthStore";

type TabName = "index" | "cases" | "management" | "settings";

const TAB_META: Record<TabName, { icon: keyof typeof Feather.glyphMap; label: string }> = {
  index:      { icon: "home",        label: "Home" },
  cases:      { icon: "folder",      label: "Cases" },
  management: { icon: "bar-chart-2", label: "Manage" },
  settings:   { icon: "settings",    label: "Settings" },
};

const TOP_RADIUS = 14;

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "superadmin" || user?.role === "admin";

  const visibleRoutes = state.routes.filter((r) => {
    if (r.name === "management" && !isAdmin) return false;
    return r.name in TAB_META;
  });

  const tabItems = visibleRoutes.map((route) => {
    const meta = TAB_META[route.name as TabName];
    const isFocused = state.routes[state.index]?.key === route.key;
    const label = (descriptors[route.key]?.options?.title as string | undefined) ?? meta.label;

    const onPress = () => {
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tab,
          isFocused && styles.tabActive,
          pressed && !isFocused && styles.tabPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={label}
      >
        <Feather
          name={meta.icon}
          size={21}
          color={isFocused ? colors.primary : colors.textMuted}
        />
        <Text style={[styles.label, isFocused && styles.labelActive]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom }]}>
      {Platform.OS === "ios" ? (
        /* iOS: shadow View wraps clip View — keeps shadow visible outside clip */
        <View style={styles.shadowIos}>
          <View style={styles.clipIos}>
            <BlurView tint="systemChromeMaterialLight" intensity={95} style={styles.bar}>
              {tabItems}
            </BlurView>
          </View>
        </View>
      ) : (
        /* Android: outer View for elevation shadow, inner clips active pill */
        <View style={styles.androidOuter}>
          <View style={styles.androidInner}>
            <View style={styles.bar}>
              {tabItems}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
  },

  /* iOS */
  shadowIos: {
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  clipIos: {
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    overflow: "hidden",
  },

  /* Android */
  androidOuter: {
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    elevation: 12,
    backgroundColor: colors.surface,
  },

  androidInner: {
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    overflow: "hidden",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },

  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 18,
    gap: 4,
  },

  tabActive: {
    backgroundColor: "rgba(41, 70, 157, 0.1)",
  },

  tabPressed: {
    opacity: 0.55,
  },

  label: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textMuted,
    letterSpacing: 0.1,
  },

  labelActive: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
});
