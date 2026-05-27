import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";

const PLAY_STORE_URL = "market://details?id=com.whatsapp";
const APP_STORE_URL = "https://apps.apple.com/app/whatsapp-messenger/id310633997";

export function getWhatsAppInstallUrl(): string {
  return Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
}

export async function openWhatsApp(
  phone?: string,
  message?: string
): Promise<boolean> {
  try {
    const encoded = message ? encodeURIComponent(message) : "";

    let url: string;
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, "");
      const indiaPhone = cleanPhone.startsWith("91")
        ? cleanPhone
        : `91${cleanPhone}`;
      url = `https://wa.me/${indiaPhone}${encoded ? `?text=${encoded}` : ""}`;
    } else if (Platform.OS === "android") {
      url = `intent://send?text=${encoded}#Intent;scheme=whatsapp;package=com.whatsapp;end`;
    } else {
      url = `whatsapp://send?text=${encoded}`;
    }

    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens WhatsApp at its home screen.
 * canOpenURL is intentionally skipped — it requires LSApplicationQueriesSchemes
 * (iOS) and <queries> (Android 11+) declarations that are absent in managed workflow.
 * Direct openURL + catch is more reliable.
 */
export async function openWhatsAppNative(): Promise<boolean> {
  try {
    await Linking.openURL("whatsapp://send");
    return true;
  } catch {
    return false;
  }
}

/**
 * Shares a text payload directly into WhatsApp's contact/group picker.
 * Android: ACTION_SEND intent locked to com.whatsapp — opens WhatsApp's
 *   forward-to list where user can pick "New Group".
 * iOS: whatsapp://send?text= — opens WhatsApp's share picker.
 */
export async function shareToWhatsAppIntent(text: string): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      await IntentLauncher.startActivityAsync("android.intent.action.SEND", {
        type: "text/plain",
        extra: { "android.intent.extra.TEXT": text },
        packageName: "com.whatsapp",
      });
      return true;
    } catch {
      return false;
    }
  } else {
    try {
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`);
      return true;
    } catch {
      return false;
    }
  }
}

export async function shareViaWhatsApp(message: string): Promise<boolean> {
  return openWhatsApp(undefined, message);
}

export async function openWhatsAppWithContact(
  phone: string,
  message: string
): Promise<boolean> {
  return openWhatsApp(phone, message);
}
