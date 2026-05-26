import { Feather } from "@expo/vector-icons";
import { useRouter, useNavigation } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import colors from "@/constants/colors";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightElement?: React.ReactNode;
}

export function AppHeader({
  title,
  subtitle,
  showBack = false,
  rightElement,
}: AppHeaderProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={() => navigation.canGoBack() ? router.back() : router.replace("/(tabs)")}
            style={({ pressed }) => [
              styles.sideSlot,
              styles.backBtn,
              pressed && styles.pressed,
            ]}
            hitSlop={8}
          >
            <Feather name="arrow-left" size={22} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.sideSlot} />
        )}

        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>{rightElement ?? null}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sideSlot: {
    width: 40,
    height: 40,
  },
  backBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.6,
  },
  titleBlock: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: colors.text,
    fontFamily: "PlusJakartaSans_700Bold",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: "PlusJakartaSans_400Regular",
    marginTop: 1,
  },
  right: {
    minWidth: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
