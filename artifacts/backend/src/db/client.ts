import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

const queryClient = postgres(env.DATABASE_URL, {
  ssl: env.NODE_ENV === "production" ? "require" : false,
});
export const db = drizzle(queryClient, { schema });
