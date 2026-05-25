import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { mockDb, queueDb, resetDb } from "../../test/mock-db.js";
import {
  ADVISOR, ADMIN, SUPERADMIN, TECHNICIAN, CASE,
  advisorToken, adminToken, superadminToken, technicianToken,
} from "../../test/helpers.js";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../db/client.js", () => ({ db: mockDb }));
vi.mock("../../lib/caseNumber.js", () => ({
  generateCaseNumber: vi.fn().mockResolvedValue("YM-250525-001"),
}));

import app from "../../test/app.js";

beforeEach(resetDb);

// ── GET /cases ─────────────────────────────────────────────────────────────────

describe("GET /cases", () => {
  it("401 without token", async () => {
    const res = await request(app).get("/cases");
    expect(res.status).toBe(401);
  });

  it("200 admin sees all cases", async () => {
    const tok = await adminToken();
    queueDb([CASE]);

    const res = await request(app)
      .get("/cases")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("200 advisor sees only own cases", async () => {
    const tok = await advisorToken();
    queueDb([CASE]);

    const res = await request(app)
      .get("/cases")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("200 technician sees open cases", async () => {
    const tok = await technicianToken();
    queueDb([CASE]);

    const res = await request(app)
      .get("/cases")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── POST /cases ────────────────────────────────────────────────────────────────

describe("POST /cases", () => {
  it("401 without token", async () => {
    const res = await request(app).post("/cases").send({
      vehicleNumber: "GJ01AB1234",
      carModel: "Swift",
    });
    expect(res.status).toBe(401);
  });

  it("403 technician cannot create case", async () => {
    const tok = await technicianToken();
    const res = await request(app)
      .post("/cases")
      .set("Authorization", `Bearer ${tok}`)
      .send({ vehicleNumber: "GJ01AB1234", carModel: "Swift" });
    expect(res.status).toBe(403);
  });

  it("201 advisor creates case", async () => {
    const tok = await advisorToken();
    queueDb([CASE]);   // insert cases returning
    queueDb([]);       // insert caseEvents

    const res = await request(app)
      .post("/cases")
      .set("Authorization", `Bearer ${tok}`)
      .send({ vehicleNumber: "GJ01AB1234", carModel: "Swift" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ vehicleNumber: "GJ01AB1234" });
  });

  it("400 on invalid phone format", async () => {
    const tok = await advisorToken();
    const res = await request(app)
      .post("/cases")
      .set("Authorization", `Bearer ${tok}`)
      .send({ vehicleNumber: "GJ01AB1234", carModel: "Swift", customerPhone: "not-phone" });
    expect(res.status).toBe(400);
  });

  it("400 on notes exceeding 5000 chars", async () => {
    const tok = await advisorToken();
    const res = await request(app)
      .post("/cases")
      .set("Authorization", `Bearer ${tok}`)
      .send({ vehicleNumber: "GJ01AB1234", carModel: "Swift", notes: "x".repeat(5001) });
    expect(res.status).toBe(400);
  });

  it("400 on missing vehicleNumber", async () => {
    const tok = await advisorToken();
    const res = await request(app)
      .post("/cases")
      .set("Authorization", `Bearer ${tok}`)
      .send({ carModel: "Swift" });
    expect(res.status).toBe(400);
  });
});

// ── GET /cases/:caseNumber ─────────────────────────────────────────────────────

describe("GET /cases/:caseNumber", () => {
  it("404 for unknown case", async () => {
    const tok = await adminToken();
    queueDb([]); // findCase returns empty

    const res = await request(app)
      .get("/cases/YM-000000-999")
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(404);
  });

  it("200 admin can view any case", async () => {
    const tok = await adminToken();
    queueDb([CASE]);            // findCase
    queueDb([]);                // events
    queueDb([ADVISOR]);         // advisor lookup

    const res = await request(app)
      .get(`/cases/${CASE.caseNumber}`)
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ caseNumber: CASE.caseNumber });
  });

  it("200 advisor can view own case", async () => {
    const tok = await advisorToken();     // userId=1, CASE.advisorId=1
    queueDb([CASE]);
    queueDb([]);
    queueDb([ADVISOR]);

    const res = await request(app)
      .get(`/cases/${CASE.caseNumber}`)
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
  });

  it("403 advisor cannot view another advisor's case", async () => {
    const tok = await advisorToken();     // userId=1
    const otherCase = { ...CASE, advisorId: 99 };
    queueDb([otherCase]);

    const res = await request(app)
      .get(`/cases/${CASE.caseNumber}`)
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(403);
  });
});

// ── PUT /cases/:caseNumber/internal-status ─────────────────────────────────────

describe("PUT /cases/:caseNumber/internal-status", () => {
  it("200 advisor updates own case status", async () => {
    const tok = await advisorToken();
    queueDb([CASE]);                                              // findCase
    queueDb([{ internalStatus: "in_progress" }]);                // update returning
    queueDb([]);                                                  // insert event

    const res = await request(app)
      .put(`/cases/${CASE.caseNumber}/internal-status`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ status: "in_progress" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ internalStatus: "in_progress" });
  });

  it("200 technician can update status", async () => {
    const tok = await technicianToken();
    queueDb([CASE]);
    queueDb([{ internalStatus: "washing" }]);
    queueDb([]);

    const res = await request(app)
      .put(`/cases/${CASE.caseNumber}/internal-status`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ status: "washing" });

    expect(res.status).toBe(200);
  });

  it("400 on invalid status value", async () => {
    const tok = await advisorToken();
    const res = await request(app)
      .put(`/cases/${CASE.caseNumber}/internal-status`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ status: "flying" });
    expect(res.status).toBe(400);
  });

  it("404 for deleted case", async () => {
    const tok = await adminToken();
    queueDb([]);  // findCase: empty = not found

    const res = await request(app)
      .put(`/cases/${CASE.caseNumber}/internal-status`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ status: "in_progress" });

    expect(res.status).toBe(404);
  });
});

// ── PUT /cases/:caseNumber/customer-status ─────────────────────────────────────

describe("PUT /cases/:caseNumber/customer-status", () => {
  it("200 advisor updates customer status", async () => {
    const tok = await advisorToken();
    queueDb([CASE]);
    queueDb([{ customerStatus: "in_repair" }]);
    queueDb([]);

    const res = await request(app)
      .put(`/cases/${CASE.caseNumber}/customer-status`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ status: "in_repair" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ customerStatus: "in_repair" });
  });

  it("403 technician cannot update customer status", async () => {
    const tok = await technicianToken();
    queueDb([CASE]);

    const res = await request(app)
      .put(`/cases/${CASE.caseNumber}/customer-status`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ status: "in_repair" });

    expect(res.status).toBe(403);
  });

  it("400 on invalid status value", async () => {
    const tok = await advisorToken();
    const res = await request(app)
      .put(`/cases/${CASE.caseNumber}/customer-status`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ status: "not_a_status" });
    expect(res.status).toBe(400);
  });
});

// ── DELETE /cases/:caseNumber ──────────────────────────────────────────────────

describe("DELETE /cases/:caseNumber", () => {
  it("401 without token", async () => {
    const res = await request(app).delete(`/cases/${CASE.caseNumber}`);
    expect(res.status).toBe(401);
  });

  it("403 advisor cannot delete", async () => {
    const tok = await advisorToken();
    const res = await request(app)
      .delete(`/cases/${CASE.caseNumber}`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(403);
  });

  it("403 technician cannot delete", async () => {
    const tok = await technicianToken();
    const res = await request(app)
      .delete(`/cases/${CASE.caseNumber}`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(403);
  });

  it("204 admin soft-deletes case", async () => {
    const tok = await adminToken();
    queueDb([CASE]);  // findCase
    queueDb([]);      // update deletedAt

    const res = await request(app)
      .delete(`/cases/${CASE.caseNumber}`)
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(204);
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("404 when case already deleted", async () => {
    const tok = await adminToken();
    queueDb([]);  // findCase: empty = soft-deleted or never existed

    const res = await request(app)
      .delete(`/cases/${CASE.caseNumber}`)
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(404);
  });
});

// ── POST /cases/:caseNumber/notify-advisor ─────────────────────────────────────

describe("POST /cases/:caseNumber/notify-advisor", () => {
  it("403 advisor cannot call notify-advisor", async () => {
    const tok = await advisorToken();
    queueDb([CASE]);

    const res = await request(app)
      .post(`/cases/${CASE.caseNumber}/notify-advisor`)
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(403);
  });

  it("200 technician creates notification", async () => {
    const tok = await technicianToken();
    queueDb([CASE]);                     // findCase
    queueDb([{ id: 50 }]);               // insert caseEvent returning
    queueDb([{ id: 77 }]);               // insert notification returning

    const res = await request(app)
      .post(`/cases/${CASE.caseNumber}/notify-advisor`)
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, notificationId: 77 });
  });

  it("404 for unknown case", async () => {
    const tok = await technicianToken();
    queueDb([]);

    const res = await request(app)
      .post(`/cases/YM-000000-999/notify-advisor`)
      .set("Authorization", `Bearer ${tok}`);

    expect(res.status).toBe(404);
  });
});
