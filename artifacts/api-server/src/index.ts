import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { initWhatsAppConnection } from "./lib/whatsapp-connection";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required. Create a .env file with PORT=8080 (see .env.example).",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Init WhatsApp in background — prints QR to terminal on first run
  initWhatsAppConnection().catch((err) => {
    logger.error({ err }, "WhatsApp connection init failed");
  });
});
