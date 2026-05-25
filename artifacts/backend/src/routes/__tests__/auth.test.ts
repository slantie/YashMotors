import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { mockDb, queueDb, resetDb } from "../../test/mock-db.js";
import { ADVISOR } from "../../test/helpers.js";
import { advisorToken } from "../../test/helpers.js";

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

vi.mock("../../db/client.js", () => ({ db: mockDb }));

const mockRedis = vi.hoisted(() => ({
  get:    vi.fn().mockResolvedValue(null),
  incr:   vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  del:    vi.fn().mockResolvedValue(1),
}));
vi.mock("../../lib/redis.js", () => ({ redis: mockRedis }));

const mockVerifyPin = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("../../lib/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/auth.js")>();
  return { ...actual, verifyPin: mockVerifyPin };
});

import app from "../../test/app.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const resetMocks = () => {
  resetDb();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.incr.mockResolvedValue(1);
  mockVerifyPin.mockResolvedValue(true);
};

// ── POST /auth/register ────────────────────────────────────────────────────────

describe("POST /auth/register", () => {
  beforeEach(resetMocks);

  it("201 creates advisor user with valid data", async () => {
    queueDb([]);                          // no existing user found
    queueDb([{ id: 10, name: "New User", phone: "+919876543299", role: "advisor" }]); // insert returning

    const res = await request(app).post("/auth/register").send({
      name: "New User",
      phone: "+919876543299",
      pin: "5678",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: "advisor" });
  });

  it("409 when phone already registered", async () => {
    queueDb([ADVISOR]); // user exists

    const res = await request(app).post("/auth/register").send({
      name: "Duplicate",
      phone: "9876543210",
      pin: "1234",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it("400 on invalid phone format", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Bad Phone",
      phone: "not-a-phone",
      pin: "1234",
    });
    expect(res.status).toBe(400);
  });

  it("400 on PIN not exactly 4 digits", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Bad PIN",
      phone: "+919876540000",
      pin: "12",
    });
    expect(res.status).toBe(400);
  });

  it("400 on missing name", async () => {
    const res = await request(app).post("/auth/register").send({
      phone: "+919876540001",
      pin: "1234",
    });
    expect(res.status).toBe(400);
  });
});

// ── POST /auth/login ───────────────────────────────────────────────────────────

describe("POST /auth/login", () => {
  beforeEach(resetMocks);

  it("200 returns tokens and user on valid credentials", async () => {
    queueDb([ADVISOR]);           // user lookup
    queueDb([]);                  // update lastLoginAt
    queueDb([{ id: 99 }]);       // insert refresh token

    const res = await request(app).post("/auth/login").send({
      phone: "9876543210",
      pin: "1234",
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
    expect(res.body.user).toMatchObject({ role: "advisor" });
  });

  it("401 on wrong PIN", async () => {
    mockVerifyPin.mockResolvedValueOnce(false);
    queueDb([ADVISOR]); // user found but PIN wrong

    const res = await request(app).post("/auth/login").send({
      phone: "9876543210",
      pin: "9999",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it("401 for unknown phone", async () => {
    queueDb([]); // no user found

    const res = await request(app).post("/auth/login").send({
      phone: "0000000000",
      pin: "1234",
    });

    expect(res.status).toBe(401);
  });

  it("401 for inactive user", async () => {
    queueDb([{ ...ADVISOR, isActive: false }]);

    const res = await request(app).post("/auth/login").send({
      phone: "9876543210",
      pin: "1234",
    });

    expect(res.status).toBe(401);
  });

  it("401 when account has no PIN set", async () => {
    queueDb([{ ...ADVISOR, pinHash: null }]);

    const res = await request(app).post("/auth/login").send({
      phone: "9876543210",
      pin: "1234",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not set up/i);
  });

  it("429 when login is rate-limited (5+ failures)", async () => {
    mockRedis.get.mockResolvedValueOnce("5"); // already at max attempts

    const res = await request(app).post("/auth/login").send({
      phone: "9876543210",
      pin: "1234",
    });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many failed attempts/i);
  });

  it("increments Redis counter on failed login", async () => {
    mockVerifyPin.mockResolvedValueOnce(false);
    queueDb([ADVISOR]);

    await request(app).post("/auth/login").send({
      phone: "9876543210",
      pin: "9999",
    });

    expect(mockRedis.incr).toHaveBeenCalledWith("login_fail:9876543210");
  });

  it("clears Redis counter on successful login", async () => {
    queueDb([ADVISOR]);
    queueDb([]);
    queueDb([{ id: 99 }]);

    await request(app).post("/auth/login").send({
      phone: "9876543210",
      pin: "1234",
    });

    expect(mockRedis.del).toHaveBeenCalledWith("login_fail:9876543210");
  });
});

// ── POST /auth/refresh ─────────────────────────────────────────────────────────

describe("POST /auth/refresh", () => {
  beforeEach(resetMocks);

  it("200 rotates tokens on valid refresh token", async () => {
    queueDb([{ id: 99, userId: 1, revoked: false, expiresAt: new Date(Date.now() + 1e9) }]); // token found
    queueDb([ADVISOR]); // user lookup
    queueDb([]);        // revoke old token
    queueDb([{ id: 100 }]); // insert new token

    const res = await request(app).post("/auth/refresh").send({
      refreshToken: "valid-refresh-token",
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
  });

  it("401 for invalid or missing refresh token", async () => {
    queueDb([]); // no token found

    const res = await request(app).post("/auth/refresh").send({
      refreshToken: "bad-token",
    });

    expect(res.status).toBe(401);
  });

  it("400 when refreshToken field missing", async () => {
    const res = await request(app).post("/auth/refresh").send({});
    expect(res.status).toBe(400);
  });
});

// ── POST /auth/logout ──────────────────────────────────────────────────────────

describe("POST /auth/logout", () => {
  beforeEach(resetMocks);

  it("401 without auth header", async () => {
    const res = await request(app).post("/auth/logout").send({});
    expect(res.status).toBe(401);
  });

  it("200 with valid token (revokes refresh token if provided)", async () => {
    const tok = await advisorToken();
    queueDb([]); // update revoked

    const res = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${tok}`)
      .send({ refreshToken: "some-token" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── PUT /auth/change-pin ───────────────────────────────────────────────────────

describe("PUT /auth/change-pin", () => {
  beforeEach(resetMocks);

  it("401 without auth", async () => {
    const res = await request(app).put("/auth/change-pin").send({
      currentPin: "1234",
      newPin: "5678",
    });
    expect(res.status).toBe(401);
  });

  it("200 on correct current PIN", async () => {
    const tok = await advisorToken();
    queueDb([ADVISOR]); // user lookup
    queueDb([]);        // update pinHash

    const res = await request(app)
      .put("/auth/change-pin")
      .set("Authorization", `Bearer ${tok}`)
      .send({ currentPin: "1234", newPin: "5678" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("401 on wrong current PIN", async () => {
    mockVerifyPin.mockResolvedValueOnce(false);
    const tok = await advisorToken();
    queueDb([ADVISOR]);

    const res = await request(app)
      .put("/auth/change-pin")
      .set("Authorization", `Bearer ${tok}`)
      .send({ currentPin: "9999", newPin: "5678" });

    expect(res.status).toBe(401);
  });
});
