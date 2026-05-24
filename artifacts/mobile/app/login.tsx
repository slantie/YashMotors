import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import colors from "@/constants/colors";
import { AuthUser, useAuthStore } from "@/store/useAuthStore";

function routeForUser(user: AuthUser): string {
  if (user.role === "superadmin" || user.role === "admin") return "/dashboard";
  if (user.role === "advisor") return "/advisor-home";
  if (user.role === "technician") return "/technician-home";
  return "/dashboard";
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pinVisible, setPinVisible] = useState(false);

  const pinRef = useRef<TextInput>(null);

  const canSubmit = phone.length === 10 && pin.length === 4 && !isLoading;

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    setPhone(digits);
    setError("");
    if (digits.length === 10) pinRef.current?.focus();
  };

  const handlePinChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setPin(digits);
    setError("");
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const user = await login(phone, pin);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(routeForUser(user) as never);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPin("");
      setError(err instanceof Error ? err.message : "Invalid phone or PIN.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.inner, { paddingBottom: insets.bottom + 24 }]}>
        {/* Brand */}
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Feather name="tool" size={30} color={colors.primary} />
          </View>
          <Text style={styles.appName}>Yash Motors App</Text>
          <Text style={styles.orgName}>Yash Motors</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Mobile Number</Text>
            <TextInput
              value={phone}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit number"
              placeholderTextColor={colors.textMuted}
              returnKeyType="next"
              onSubmitEditing={() => pinRef.current?.focus()}
              blurOnSubmit={false}
              selectionColor={colors.primary}
              style={[styles.input, phone.length === 10 && styles.inputFilled]}
              autoComplete="tel"
              textContentType="telephoneNumber"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PIN</Text>
            <View style={styles.pinRow}>
              <TextInput
                ref={pinRef}
                value={pin}
                onChangeText={handlePinChange}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={4}
                placeholder="4-digit PIN"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!pinVisible}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                selectionColor={colors.primary}
                style={[
                  styles.input,
                  styles.pinInput,
                  pin.length === 4 && styles.inputFilled,
                ]}
                autoComplete="current-password"
                textContentType="password"
              />
              <Pressable
                onPress={() => setPinVisible((v) => !v)}
                style={styles.eyeBtn}
                hitSlop={8}
              >
                <Feather
                  name={pinVisible ? "eye-off" : "eye"}
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.loginBtn,
              !canSubmit && styles.loginBtnDisabled,
              pressed && canSubmit && styles.loginBtnPressed,
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginText}>Login</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 40,
  },
  brand: {
    alignItems: "center",
    gap: 8,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryFaint,
    borderWidth: 1,
    borderColor: colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  appName: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
    letterSpacing: 0.3,
  },
  orgName: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
  },
  form: {
    gap: 20,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500" as const,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    paddingHorizontal: 16,
    letterSpacing: 1,
  },
  inputFilled: {
    borderColor: colors.primary,
  },
  pinRow: {
    position: "relative",
  },
  pinInput: {
    paddingRight: 52,
  },
  eyeBtn: {
    position: "absolute",
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  error: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500" as const,
    color: colors.destructive,
    textAlign: "center",
    marginTop: -8,
  },
  loginBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  loginBtnPressed: { opacity: 0.88 },
  loginBtnDisabled: { opacity: 0.42 },
  loginText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    color: "#fff",
    letterSpacing: 0.3,
  },
});
