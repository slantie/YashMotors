import { Redirect } from "expo-router";

import { useAuthStore } from "@/store/useAuthStore";

export default function Index() {
  const user = useAuthStore((state) => state.user);
  if (!user) return null; // _layout.tsx handles redirect to /login
  return <Redirect href="/(tabs)" />;
}
