import { signAccessToken, type JwtPayload } from "../lib/auth.js";

// ── Test user fixtures ─────────────────────────────────────────────────────────

export const ADVISOR = {
  id: 1, name: "Test Advisor", phone: "9876543210",
  role: "advisor" as const, departmentId: null,
  pinHash: "MOCK_HASH", pushToken: null, isActive: true,
  lastLoginAt: null, createdAt: new Date("2025-01-01"),
};

export const ADMIN = {
  ...ADVISOR, id: 2, role: "admin" as const, phone: "9876543211",
};

export const SUPERADMIN = {
  ...ADVISOR, id: 3, role: "superadmin" as const, phone: "9876543212",
};

export const TECHNICIAN = {
  ...ADVISOR, id: 4, role: "technician" as const, phone: "9876543213",
};

export const CASE = {
  id: 100, caseNumber: "YM-250525-001",
  vehicleNumber: "GJ01AB1234", carModel: "Swift",
  customerPhone: "9012345678", customerName: "Test Customer",
  kmCount: "50000", dueDate: "2025-06-01", deliveryType: "pickup",
  notes: "Test notes",
  internalStatus: "intake" as const, customerStatus: "received" as const,
  whatsappGroupId: null, whatsappInviteLink: null, whatsappStatus: null,
  advisorId: 1, deletedAt: null,
  createdAt: new Date("2025-01-01"), updatedAt: new Date("2025-01-01"),
};

// ── Token helpers ──────────────────────────────────────────────────────────────

export const token = (payload: Partial<JwtPayload> & { userId: number; role: string }) =>
  signAccessToken({
    userId:  payload.userId,
    role:    payload.role,
    name:    payload.name    ?? "Test User",
    phone:   payload.phone   ?? "9876543210",
  });

export const advisorToken  = () => token({ userId: 1, role: "advisor" });
export const adminToken    = () => token({ userId: 2, role: "admin" });
export const superadminToken = () => token({ userId: 3, role: "superadmin" });
export const technicianToken = () => token({ userId: 4, role: "technician" });
