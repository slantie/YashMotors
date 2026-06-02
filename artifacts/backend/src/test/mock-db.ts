import { vi } from "vitest";

// Result queue: each call to a terminal method (limit/orderBy/returning/then)
// pops and returns the next queued result. Tests call queueDb(...) to set up
// expected DB call results in the order the handler makes them.
const queue: unknown[][] = [];

export const queueDb = (...results: unknown[][]) => queue.push(...results);
export const clearDb = () => queue.splice(0);
const pop = (): unknown[] => (queue.shift() ?? []) as unknown[];

// Chainable Drizzle-like query builder mock. EVERY builder method returns the same
// thenable chain, so any call order resolves correctly — including modifiers that come
// after `limit`, e.g. `.where().limit(1).for("update")`. The single terminal is `then`:
// awaiting the chain pops one queued result. (Previously `limit`/`orderBy`/`returning`
// returned a Promise, so chaining `.for("update")` after `.limit(1)` threw → spurious 500.)
function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {
    from:      () => chain(),
    where:     () => chain(),
    leftJoin:  () => chain(),
    innerJoin: () => chain(),
    set:       () => chain(),
    values:    () => chain(),
    offset:    () => chain(),
    orderBy:   () => chain(),
    limit:     () => chain(),
    for:       () => chain(),
    returning: () => chain(),
    onConflictDoNothing: () => chain(),
    onConflictDoUpdate:  () => chain(),
    // Thenable — awaiting any chain resolves the next queued result.
    then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(pop()).then(resolve, reject),
  };
  return c;
}

// A transaction client exposes the same chainable builders as the top-level db, so
// handlers using `db.transaction(async (tx) => { tx.select()... tx.update()... })` consume
// from the same result queue in call order.
const txClient = {
  select: () => chain(),
  insert: () => chain(),
  update: () => chain(),
  delete: () => chain(),
};

export const mockDb = {
  select: vi.fn(() => chain()),
  insert: vi.fn(() => chain()),
  update: vi.fn(() => chain()),
  delete: vi.fn(() => chain()),
  transaction: vi.fn(async (cb: (tx: typeof txClient) => unknown) => cb(txClient)),
};

export const resetDb = () => {
  clearDb();
  mockDb.select.mockClear();
  mockDb.insert.mockClear();
  mockDb.update.mockClear();
  mockDb.delete.mockClear();
  mockDb.transaction.mockClear();
  // Restore chain factory after clear
  mockDb.select.mockImplementation(() => chain());
  mockDb.insert.mockImplementation(() => chain());
  mockDb.update.mockImplementation(() => chain());
  mockDb.delete.mockImplementation(() => chain());
  mockDb.transaction.mockImplementation(async (cb: (tx: typeof txClient) => unknown) => cb(txClient));
};
