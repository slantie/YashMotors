import { Tabs } from "expo-router";
import React from "react";

import { TabBar } from "@/components/TabBar";
import { useAuthStore } from "@/store/useAuthStore";

export default function TabsLayout() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "superadmin" || user?.role === "admin";

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index"      options={{ title: "Home" }} />
      <Tabs.Screen name="cases"      options={{ title: "Cases" }} />
      <Tabs.Screen name="management" options={{ title: "Manage", href: isAdmin ? undefined : null }} />
      <Tabs.Screen name="settings"   options={{ title: "Settings" }} />
    </Tabs>
  );
}
