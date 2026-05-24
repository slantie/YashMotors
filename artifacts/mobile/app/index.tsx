import { Redirect } from "expo-router";

import { useAuthStore } from "@/store/useAuthStore";

export default function Index() {
  const user = useAuthStore((state) => state.user);
  if (!user) return null; // _layout.tsx handles redirect to /login
  if (user.role === "superadmin" || user.role === "admin") {
    return <Redirect href="/dashboard" />;
  }
  if (user.role === "advisor") {
    return <Redirect href="/advisor-home" />;
  }
  return <Redirect href="/intake" />;
}
