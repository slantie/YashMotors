import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { mockDb, queueDb, resetDb } from "../../test/mock-db.js";
import {
  ADVISOR, ADMIN, SUPERADMIN,
  advisorToken, adminToken, superadminToken, technicianToken,
} from "../../test/helpers.js";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../db/client.js", () => ({ db: mockDb }));

import app from "../../test/app.js";

beforeEach(resetDb);

// ── GET /users ─────────────────────────────────────────────────────────────────

describe("GET /users", () => {
  it("401 without token", async () => {
    const res = await request(app).get("/users");
    expect(res.status).toBe(401);
  });

  it("403 advisor cannot list users", async () => {
    const tok = await advisorToken();
    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(403);
  });

  it("403 technician cannot list users", async () => {
    const tok = await technicianToken();
    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(403);
  });

  it("200 admin gets user list", async () => {
    const tok = await adminToken();
    queueDb([ADVISOR, ADMIN]);

    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("200 superadmin gets user list", async () => {
    const tok = await superadminToken();
    queueDb([ADVISOR, ADMIN, SUPERADMIN]);

    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });
});

// ── GET /users/me ──────────────────────────────────────────────────────────────

describe("GET /users/me", () => {
  it("401 without token", async () => {
    const res = await request(app).get("/users/me");
    expect(res.status).toBe(401);
  });

  it("200 returns own profile", async () => {
    const tok = await advisorToken();
    queueDb([ADVISOR]);

    const res = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: "advisor" });
  });

  it("404 when user not found in DB", async () => {
    const tok = await advisorToken();
    queueDb([]); // no user returned

    const res = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ── POST /users ────────────────────────────────────────────────────────────────

describe("POST /users", () => {
  it("401 without token", async () => {
    const res = await request(app).post("/users").send({
      name: "New Guy", phone: "9876543299", role: "advisor",
    });
    expect(res.status).toBe(401);
  });

  it("403 admin cannot create user", async () => {
    const tok = await adminToken();
    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "New Guy", phone: "9876543299", role: "advisor" });
    expect(res.status).toBe(403);
  });

  it("403 advisor cannot create user", async () => {
    const tok = await advisorToken();
    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "New Guy", phone: "9876543299", role: "advisor" });
    expect(res.status).toBe(403);
  });

  it("201 superadmin creates user", async () => {
    const tok = await superadminToken();
    queueDb([{ id: 10, name: "New Guy", phone: "9876543299", role: "advisor", isActive: true, createdAt: new Date() }]);

    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "New Guy", phone: "9876543299", role: "advisor", pin: "1234" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: "advisor" });
  });

  it("400 on invalid role", async () => {
    const tok = await superadminToken();
    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "New Guy", phone: "9876543299", role: "owner" });
    expect(res.status).toBe(400);
  });

  it("400 on PIN not 4 digits", async () => {
    const tok = await superadminToken();
    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "New Guy", phone: "9876543299", role: "advisor", pin: "abc" });
    expect(res.status).toBe(400);
  });

  it("400 on missing name", async () => {
    const tok = await superadminToken();
    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${tok}`)
      .send({ phone: "9876543299", role: "advisor" });
    expect(res.status).toBe(400);
  });
});

// ── PUT /users/:id ─────────────────────────────────────────────────────────────

describe("PUT /users/:id", () => {
  it("403 non-superadmin cannot update user", async () => {
    const tok = await adminToken();
    const res = await request(app)
      .put("/users/1")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "Updated" });
    expect(res.status).toBe(403);
  });

  it("200 superadmin updates user", async () => {
    const tok = await superadminToken();
    queueDb([{ id: 1, name: "Updated", role: "advisor", isActive: true }]);

    const res = await request(app)
      .put("/users/1")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated");
  });

  it("404 when user does not exist", async () => {
    const tok = await superadminToken();
    queueDb([]); // update returns empty

    const res = await request(app)
      .put("/users/999")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "Ghost" });

    expect(res.status).toBe(404);
  });
});

// ── PUT /users/:id/pin ─────────────────────────────────────────────────────────

describe("PUT /users/:id/pin", () => {
  it("403 non-superadmin cannot reset PIN", async () => {
    const tok = await adminToken();
    const res = await request(app)
      .put("/users/1/pin")
      .set("Authorization", `Bearer ${tok}`)
      .send({ pin: "5678" });
    expect(res.status).toBe(403);
  });

  it("200 superadmin resets PIN", async () => {
    const tok = await superadminToken();
    queueDb([]);  // update (no returning needed)

    const res = await request(app)
      .put("/users/1/pin")
      .set("Authorization", `Bearer ${tok}`)
      .send({ pin: "5678" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("400 on non-4-digit PIN", async () => {
    const tok = await superadminToken();
    const res = await request(app)
      .put("/users/1/pin")
      .set("Authorization", `Bearer ${tok}`)
      .send({ pin: "12" });
    expect(res.status).toBe(400);
  });

  it("400 on alpha PIN", async () => {
    const tok = await superadminToken();
    const res = await request(app)
      .put("/users/1/pin")
      .set("Authorization", `Bearer ${tok}`)
      .send({ pin: "abcd" });
    expect(res.status).toBe(400);
  });
});

// ── DELETE /users/:id ──────────────────────────────────────────────────────────

describe("DELETE /users/:id", () => {
  it("403 non-superadmin cannot deactivate user", async () => {
    const tok = await adminToken();
    const res = await request(app)
      .delete("/users/1")
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(403);
  });

  it("400 superadmin cannot deactivate self (userId=3)", async () => {
    const tok = await superadminToken();  // userId=3 per helpers.ts
    const res = await request(app)
      .delete("/users/3")
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/yourself/i);
  });

  it("200 superadmin deactivates another user", async () => {
    const tok = await superadminToken();
    queueDb([]);  // update isActive=false

    const res = await request(app)
      .delete("/users/1")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
