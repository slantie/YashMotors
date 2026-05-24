import { createRequire } from "module";
import path from "path";
import pino from "pino";
import qrcode from "qrcode-terminal";

// Baileys is CJS — use createRequire so the default export resolves correctly
// in an ESM/tsx context instead of getting the module namespace object.
const require = createRequire(import.meta.url);
const Baileys = require("@whiskeysockets/baileys") as typeof import("@whiskeysockets/baileys");

const makeWASocket = (Baileys as any).default ?? Baileys;
const { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } =
  Baileys;

import type { WASocket } from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";

const AUTH_DIR = path.resolve(process.cwd(), "auth_info_baileys");

let sock: WASocket | null = null;
let isConnected = false;

export function isWhatsAppConnected(): boolean {
  return isConnected;
}

export function getSocket(): WASocket {
  if (!sock || !isConnected) {
    throw new Error(
      "WhatsApp not connected. Scan the QR code in the server terminal."
    );
  }
  return sock;
}

export async function initWhatsAppConnection(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const baileysLogger = pino({ level: "silent" });

  sock = makeWASocket({
    version,
    auth: state,
    logger: baileysLogger,
  }) as WASocket;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\n[WhatsApp] Scan this QR code with your phone:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      isConnected = true;
      console.log("[WhatsApp] Connected ✓");
    }

    if (connection === "close") {
      isConnected = false;
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;

      if (loggedOut) {
        console.log(
          "[WhatsApp] Logged out. Delete auth_info_baileys/ and restart to re-scan."
        );
      } else {
        console.log("[WhatsApp] Disconnected, reconnecting in 5s...");
        setTimeout(initWhatsAppConnection, 5000);
      }
    }
  });
}

/** Format phone number to Baileys JID: 91XXXXXXXXXX@s.whatsapp.net */
export function toJid(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const with91 = digits.startsWith("91") ? digits : `91${digits}`;
  return `${with91}@s.whatsapp.net`;
}
