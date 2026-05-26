import React from "react";

import { useAuthStore } from "@/store/useAuthStore";

import AdvisorHomeScreen from "../advisor-home";
import DashboardScreen from "../dashboard";
import TechnicianHomeScreen from "../technician-home";

export default function HomeTab() {
  const user = useAuthStore((s) => s.user);
  if (user?.role === "advisor") return <AdvisorHomeScreen />;
  if (user?.role === "technician") return <TechnicianHomeScreen />;
  return <DashboardScreen />;
}
