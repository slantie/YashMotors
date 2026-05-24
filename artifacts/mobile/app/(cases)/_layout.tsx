import { Stack } from "expo-router";
import React from "react";

import colors from "@/constants/colors";

export default function CasesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[caseNumber]" />
    </Stack>
  );
}
