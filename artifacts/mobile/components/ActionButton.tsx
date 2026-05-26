import { Feather } from "@expo/vector-icons";
import React, { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import colors from "@/constants/colors";

type ButtonVariant = "primary" | "secondary" | "whatsapp" | "outline" | "ghost";

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Feather.glyphMap;
  iconRight?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function ActionButton({
  label,
  onPress,
  variant = "primary",
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = true,
}: ActionButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const variantStyle = variantStyles[variant];
  const isDisabled = disabled || loading;

  return (
    <Animated.View style={[fullWidth && styles.fullWidth, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={[
          styles.btn,
          variantStyle.btn,
          isDisabled && styles.disabled,
          fullWidth && styles.fullWidth,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variantStyle.iconColor}
          />
        ) : (
          <View style={styles.content}>
            {icon && (
              <Feather
                name={icon}
                size={18}
                color={variantStyle.iconColor}
                style={styles.iconLeft}
              />
            )}
            <Text style={[styles.label, variantStyle.label]}>{label}</Text>
            {iconRight && (
              <Feather
                name={iconRight}
                size={18}
                color={variantStyle.iconColor}
                style={styles.iconRight}
              />
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: colors.radius,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  fullWidth: {
    width: "100%",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  label: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
  },
  disabled: {
    opacity: 0.45,
  },
});

const variantStyles = {
  primary: {
    btn: {
      backgroundColor: colors.primary,
    },
    label: {
      color: "#FFFFFF",
    },
    iconColor: "#FFFFFF",
  },
  whatsapp: {
    btn: {
      backgroundColor: colors.whatsapp,
    },
    label: {
      color: "#FFFFFF",
    },
    iconColor: "#FFFFFF",
  },
  secondary: {
    btn: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    label: {
      color: colors.text,
    },
    iconColor: colors.text,
  },
  outline: {
    btn: {
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    label: {
      color: colors.primary,
    },
    iconColor: colors.primary,
  },
  ghost: {
    btn: {
      backgroundColor: "transparent",
    },
    label: {
      color: colors.textSecondary,
    },
    iconColor: colors.textSecondary,
  },
};
