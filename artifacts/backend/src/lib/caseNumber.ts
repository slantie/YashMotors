import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { dailyCaseSequences } from "../db/schema.js";

/** Atomically increment daily sequence and return YM-YYMMDD-001 style case number */
export async function generateCaseNumber(): Promise<string> {
  // Use IST (UTC+5:30) so case numbers reflect India date regardless of server timezone
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const yy = String(ist.getUTCFullYear()).slice(2);
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  const dateStr = `${yy}${mm}${dd}`;
  const today = `${ist.getUTCFullYear()}-${mm}-${dd}`; // YYYY-MM-DD for DB date col

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
