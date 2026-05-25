import { vi } from "vitest";

// Result queue: each call to a terminal method (limit/orderBy/returning/then)
// pops and returns the next queued result. Tests call queueDb(...) to set up
// expected DB call results in the order the handler makes them.
const queue: unknown[][] = [];

export const queueDb = (...results: unknown[][]) => queue.push(...results);
export const clearDb = () => queue.splice(0);
const pop = (): unknown[] => (queue.shift() ?? []) as unknown[];

// Chainable Drizzle-like query builder mock.
// Intermediate methods (from/where/etc) return a fresh chain.
// Terminal methods resolve from the queue.
function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {
    from:      () => chain(),
    where:     () => chain(),
    leftJoin:  () => chain(),
    innerJoin: () => chain(),
    set:       () => chain(),
    values:    () => chain(),
    offset:    () => chain(),
    orderBy:   () => Promise.resolve(pop()),
    limit:     () => Promise.resolve(pop()),
    returning: () => Promise.resolve(pop()),
    // Thenable — for `await db.select({count}).from(T).where(cond)` without terminal
    then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(pop()).then(resolve, reject),
  };
  return c;
}

export const mockDb = {
  select: vi.fn(() => chain()),
  insert: vi.fn(() => chain()),
  update: vi.fn(() => chain()),
  delete: vi.fn(() => chain()),
};

export const resetDb = () => {
  clearDb();
  mockDb.select.mockClear();
  mockDb.insert.mockClear();
  mockDb.update.mockClear();
  mockDb.delete.mockClear();
  // Restore chain factory after clear
  mockDb.select.mockImplementation(() => chain());
  mockDb.insert.mockImplementation(() => chain());
  mockDb.update.mockImplementation(() => chain());
  mockDb.delete.mockImplementation(() => chain());
};
