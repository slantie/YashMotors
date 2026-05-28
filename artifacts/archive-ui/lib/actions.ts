"use server";

import { db } from "@/lib/db";
import { cases, caseEvents, caseEventImages, users } from "@/lib/schema";
import { eq, desc, asc, or, and, ilike, sql } from "drizzle-orm";
import { presignGet } from "@/lib/s3";

const PAGE_SIZE = 30;

export type SortField = "createdAt" | "vehicleNumber" | "caseNumber" | "internalStatus";
export type SortDir = "asc" | "desc";

const SORT_COLS = {
  createdAt: cases.createdAt,
  vehicleNumber: cases.vehicleNumber,
  caseNumber: cases.caseNumber,
  internalStatus: cases.internalStatus,
} as const;

export async function getStats() {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      deleted: sql<number>`count(*) filter (where deleted_at is not null)::int`,
    })
    .from(cases);
  return { total: row.total, deleted: row.deleted, active: row.total - row.deleted };
}

export async function getCases(
  q = "",
  page = 1,
  sortField: SortField = "createdAt",
  sortDir: SortDir = "desc",
  status = ""
) {
  const offset = (page - 1) * PAGE_SIZE;

  const where = and(
    q.trim()
      ? or(
          ilike(cases.caseNumber, `%${q}%`),
          ilike(cases.vehicleNumber, `%${q}%`),
          ilike(cases.customerName, `%${q}%`),
          ilike(cases.customerPhone, `%${q}%`),
          ilike(cases.carModel, `%${q}%`)
        )
      : undefined,
    status ? sql`${cases.internalStatus} = ${status}` : undefined
  );

  const col = SORT_COLS[sortField] ?? cases.createdAt;
  const order = sortDir === "asc" ? asc(col) : desc(col);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        vehicleNumber: cases.vehicleNumber,
        carModel: cases.carModel,
        customerName: cases.customerName,
        customerPhone: cases.customerPhone,
        internalStatus: cases.internalStatus,
        advisorName: users.name,
        createdAt: cases.createdAt,
        deletedAt: cases.deletedAt,
      })
      .from(cases)
      .leftJoin(users, eq(cases.advisorId, users.id))
      .where(where)
      .orderBy(order)
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(cases).where(where),
  ]);

  return { rows, total: count, page, pageSize: PAGE_SIZE };
}

export async function getCaseDetail(caseNumber: string) {
  const [c] = await db
    .select()
    .from(cases)
    .where(eq(cases.caseNumber, caseNumber))
    .limit(1);

  if (!c) return null;

  const [advisor] = await db
    .select({ id: users.id, name: users.name, phone: users.phone, role: users.role })
    .from(users)
    .where(eq(users.id, c.advisorId))
    .limit(1);

  const eventRows = await db
    .select({ event: caseEvents, creatorName: users.name })
    .from(caseEvents)
    .leftJoin(users, eq(caseEvents.createdBy, users.id))
    .where(eq(caseEvents.caseId, c.id))
    .orderBy(caseEvents.createdAt);

  const imageRows = await db
    .select()
    .from(caseEventImages)
    .where(eq(caseEventImages.caseId, c.id))
    .orderBy(caseEventImages.createdAt);

  const imagesWithUrls = await Promise.all(
    imageRows.map(async (img) => {
      let url = "";
      try { url = await presignGet(img.s3Key, 3600); } catch {}
      return { ...img, url };
    })
  );

  return { case: c, advisor, events: eventRows, images: imagesWithUrls };
}
