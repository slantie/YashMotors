import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { dailyCaseSequences } from "../db/schema.js";

/** Atomically increment daily sequence and return YM-YYMMDD-001 style case number */
export async function generateCaseNumber(): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateStr = `${yy}${mm}${dd}`;
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD for DB date col

  // Atomic upsert: insert seq=1 or increment existing
  const [row] = await db
    .insert(dailyCaseSequences)
    .values({ date: today, lastSeq: 1 })
    .onConflictDoUpdate({
      target: dailyCaseSequences.date,
      set: { lastSeq: sql`${dailyCaseSequences.lastSeq} + 1` },
    })
    .returning({ lastSeq: dailyCaseSequences.lastSeq });

  const seq = String(row.lastSeq).padStart(3, "0");
  return `YM-${dateStr}-${seq}`;
}
