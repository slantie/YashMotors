/**
 * Standalone migration runner. Run as an explicit deploy step BEFORE starting the app
 * (and after taking a Neon branch/backup), e.g. `pnpm --filter @workspace/backend migrate`.
 * Kept out of the server boot path so a slow/failed migration can never crash-loop the API.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../env.js";

const client = postgres(env.DATABASE_URL, {
  ssl: env.NODE_ENV === "production" ? "require" : false,
  max: 1,
});

try {
  console.log("Running database migrations...");
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
