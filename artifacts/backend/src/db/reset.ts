import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./client.js";

async function reset() {
  console.log("Resetting database — truncating all tables and restarting sequences...");

  await db.execute(sql`
    TRUNCATE TABLE
      notifications,
      case_event_images,
      case_events,
      cases,
      daily_case_sequences,
      refresh_tokens,
      users,
      departments
    RESTART IDENTITY CASCADE
  `);

  console.log("✓ All tables cleared, all identity sequences reset to 1");
  process.exit(0);
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
