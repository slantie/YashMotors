import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";

let RNBootSplash: { hide: (opts: { fade: boolean }) => Promise<void> } | null = null;
try {
  RNBootSplash = require("react-native-bootsplash").default;
} catch {
  // Expo Go — fall back to expo-splash-screen
}

SplashScreen.preventAutoHideAsync().catch(() => {});
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import colors from "@/constants/colors";
import { useAuthStore } from "@/store/useAuthStore";
import { Sentry, reportError } from "@/lib/sentry";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerPushToken(accessToken: string) {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!API_BASE_URL) return;
    await fetch(`${API_BASE_URL}/notifications/push-token`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token: tokenData.data }),
    });
  } catch (err) {
    console.warn("[push] Token registration failed (non-fatal):", err);
  }
}


// Tuned for a workshop floor on intermittent mobile data: serve cached data first, keep
// it long enough to avoid spinners on every app switch, and back off retries gently.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      networkMode: "offlineFirst",
    },
  },
});

// Persist the cache to AsyncStorage so a relaunch shows last-known data instantly instead
// of blank/loading screens.
const asyncPersister = createAsyncStoragePersister({ storage: AsyncStorage });

function RootLayoutNav() {
  const segments = useSegments();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const [sessionRestored, setSessionRestored] = useState(false);

  useEffect(() => {
    restoreSession().finally(() => setSessionRestored(true));
  }, [restoreSession]);

  useEffect(() => {
    if (user && accessToken) {
      registerPushToken(accessToken);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!sessionRestored) return;

    const inLogin = segments[0] === "login";
    if (!user && !inLogin) {
      router.replace("/login");
    } else if (user && inLogin) {
      router.replace("/(tabs)");
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(cases)" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="advisor-home" />
      <Stack.Screen name="technician-home" />
      <Stack.Screen name="intake" />
      <Stack.Screen name="ocr-preview" />
      <Stack.Screen name="whatsapp-workflow" />
      <Stack.Screen name="image-sharing" />
      <Stack.Screen name="management" />
    </Stack>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      if (RNBootSplash) {
        RNBootSplash.hide({ fade: true });
      } else {
        SplashScreen.hideAsync();
      }
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary onError={(error) => reportError(error)}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: asyncPersister, maxAge: 24 * 60 * 60 * 1000 }}
        >
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <StatusBar style="dark" backgroundColor={colors.background} />
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

// Sentry.wrap is a passthrough when Sentry is not initialized (no DSN).
export default Sentry.wrap(RootLayout);
