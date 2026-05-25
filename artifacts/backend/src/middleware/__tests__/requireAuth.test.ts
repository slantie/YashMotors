import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { mockDb, resetDb, queueDb } from "../../test/mock-db.js";
import { advisorToken, adminToken, superadminToken, ADVISOR } from "../../test/helpers.js";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../db/client.js", () => ({ db: mockDb }));

import app from "../../test/app.js";

// Use /users/me as a stable protected endpoint for middleware tests.
// It requires only requireAuth (any role), returns 200 when token valid.

// ── requireAuth ────────────────────────────────────────────────────────────────

describe("requireAuth middleware", () => {
  beforeEach(resetDb);

  it("401 on missing Authorization header", async () => {
    const res = await request(app).get("/users/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing token/i);
  });

  it("401 on non-Bearer scheme", async () => {
    const res = await request(app)
      .get("/users/me")
      .set("Authorization", "Basic dXNlcjpwYXNz");
    expect(res.status).toBe(401);
  });

  it("401 on tampered token", async () => {
    const res = await request(app)
      .get("/users/me")
      .set("Authorization", "Bearer totally.not.a.jwt");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it("401 on empty Bearer value", async () => {
    const res = await request(app)
      .get("/users/me")
      .set("Authorization", "Bearer ");
    expect(res.status).toBe(401);
  });

  it("200 valid advisor token passes through", async () => {
    const tok = await advisorToken();
    queueDb([ADVISOR]);

    const res = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
  });

  it("200 valid admin token passes through", async () => {
    const tok = await adminToken();
    queueDb([{ ...ADVISOR, id: 2, role: "admin" }]);

    const res = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
  });
});

// ── requireRole ────────────────────────────────────────────────────────────────

describe("requireRole middleware", () => {
  beforeEach(resetDb);

  // POST /users requires superadmin — use it to test role enforcement.

  it("403 advisor on superadmin-only route", async () => {
    const tok = await advisorToken();
    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "X", phone: "9876543299", role: "advisor" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/insufficient permissions/i);
  });

  it("403 admin on superadmin-only route", async () => {
    const tok = await adminToken();
    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "X", phone: "9876543299", role: "advisor" });
    expect(res.status).toBe(403);
  });

  it("201 superadmin passes requireRole(superadmin)", async () => {
    const tok = await superadminToken();
    queueDb([{ id: 10, name: "X", phone: "9876543299", role: "advisor", isActive: true, createdAt: new Date() }]);

    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "X", phone: "9876543299", role: "advisor", pin: "1234" });

    expect(res.status).toBe(201);
  });

  // GET /users requires admin or superadmin — test multi-role allow.

  it("200 admin passes requireRole(superadmin, admin)", async () => {
    const tok = await adminToken();
    queueDb([ADVISOR]);

    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
  });

  it("403 technician on admin-only route", async () => {
    const { technicianToken } = await import("../../test/helpers.js");
    const tok = await technicianToken();
    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(403);
  });
});
