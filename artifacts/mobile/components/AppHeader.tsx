import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import colors from "@/constants/colors";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /**
   * undefined (default) — auto: show back when navigation stack has a previous screen
   * true  — always show back
   * false — never show back
   */
  showBack?: boolean;
  rightElement?: React.ReactNode;
}

export function AppHeader({ title, subtitle, showBack, rightElement }: AppHeaderProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const canGoBack = navigation.canGoBack();
  const showBackBtn = showBack !== undefined ? showBack : canGoBack;

  const handleBack = () => {
    if (canGoBack) router.back();
    else router.replace("/(tabs)");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 22 }]}>
      <View style={styles.row}>

        {/* Left slot — back button or spacer */}
        {showBackBtn ? (
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.sideBtn, pressed && styles.pressed]}
            hitSlop={10}
          >
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.sideSlot} />
        )}

        {/* Centre — title + subtitle */}
        <View style={styles.centre}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>

        {/* Right slot */}
        <View style={styles.rightSlot}>
          {rightElement ?? null}
        </View>

      </View>
    </View>
  );
}

const SLOT = 40;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  /* back button */
  sideBtn: {
    width: SLOT,
    height: SLOT,
    borderRadius: SLOT / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.55 },
  /* empty spacer keeps title centred when no back button */
  sideSlot: {
    width: SLOT,
    height: SLOT,
  },
  /* centred title block */
  centre: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700" as const,
    fontFamily: "PlusJakartaSans_700Bold",
    color: colors.text,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  /* right actions slot */
  rightSlot: {
    width: SLOT,
    height: SLOT,
    alignItems: "center",
    justifyContent: "center",
  },
});
