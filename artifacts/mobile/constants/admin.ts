// Admin/staff contact numbers are injected at build time via EXPO_PUBLIC_* env vars
// (set per-profile in eas.json), NOT hardcoded in source. Rotating a number then only
// requires an EAS build, not a source change. Long-term, fetch these from a backend
// endpoint so they can be rotated server-side without any rebuild.
export const ADMIN_NUMBER = process.env.EXPO_PUBLIC_ADMIN_PHONE ?? "";
export const ADMIN_DISPLAY = process.env.EXPO_PUBLIC_ADMIN_DISPLAY ?? "";
export const NANDISH_NUMBER = process.env.EXPO_PUBLIC_NANDISH_PHONE ?? "";
export const NANDISH_DISPLAY = process.env.EXPO_PUBLIC_NANDISH_DISPLAY ?? "";
