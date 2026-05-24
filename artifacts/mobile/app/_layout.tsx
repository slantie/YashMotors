import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import colors from "@/constants/colors";
import { useAuthStore } from "@/store/useAuthStore";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const segments = useSegments();
  const user = useAuthStore((state) => state.user);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const [sessionRestored, setSessionRestored] = useState(false);

  useEffect(() => {
    restoreSession().finally(() => setSessionRestored(true));
  }, [restoreSession]);

  useEffect(() => {
    if (!sessionRestored) return;

    const inLogin = segments[0] === "login";
    if (!user && !inLogin) {
      router.replace("/login");
    } else if (user && inLogin) {
      if (user.role === "superadmin" || user.role === "admin") {
        router.replace("/dashboard");
      } else if (user.role === "advisor") {
        router.replace("/advisor-home");
      } else {
        router.replace("/intake");
      }
    }
  }, [sessionRestored, segments, user]);

  if (!sessionRestored) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="index" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="advisor-home" />
      <Stack.Screen name="intake" />
      <Stack.Screen name="ocr-preview" />
      <Stack.Screen name="whatsapp-workflow" />
      <Stack.Screen name="image-sharing" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="(cases)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <StatusBar style="dark" backgroundColor={colors.background} />
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
