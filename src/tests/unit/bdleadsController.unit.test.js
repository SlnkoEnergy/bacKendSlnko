// NEW FILE: src/tests/unit/dashboard.controllers.unit.test.js
const mongoose = require("mongoose");
const request = require("supertest");

jest.mock("../../middlewares/auth", () => ({
    authentication: (req, _res, next) => {
        const id = req.headers["x-test-user-id"];
        if (id) req.user = { userId: id };
        next();
    },
    authorization: (_req, _res, next) => next(),
}));

// Models & app
const Users = require("../../Modells/users/userModells");
const Leads = require("../../Modells/bdleads/bdleadsModells");
const Handovers = require("../../Modells/handoversheet.model");
const app = require("../../index");

// ---------- Helpers ----------
const unique = () => Math.random().toString(36).slice(2, 8);

async function seedUser({
    _id,
    name,
    department = "Accounts",
    role = "member",
    emp_id,
    password = "Test@12345",
    email,
}) {
    const id = _id || new mongoose.Types.ObjectId();
    const emp = emp_id || `SE-TEST-${id.toString().slice(-4)}-${unique()}`;
    const mail = email || `${id}@x.test`;
    return Users.create({
        _id: id,
        name,
        department,
        role,
        emp_id: emp,
        password,
        email: mail,
    });
}

function makeLeadDoc({
    userId,
    createdAt,
    sourceFrom = "Marketing",
    statusName = "initial",
    projectCapacity = "5 kWp",
}) {
    const from =
        typeof sourceFrom === "string" && sourceFrom.trim().length
            ? sourceFrom
            : "Others";

    return {
        name: "Seed Test Lead",
        company_name: "Acme Solar Pvt Ltd",
        contact_details: { email: "seed@example.com", mobile: ["9876543210"] },
        group: "BD",
        address: {
            village: "Kothrud",
            district: "Pune",
            state: "Maharashtra",
            postalCode: "411038",
            country: "India",
        },
        project_details: {
            capacity: projectCapacity, // required (non-empty)
            distance_from_substation: { unit: "km", value: "3" },
            available_land: { unit: "km", value: "2" },
            tarrif: "INR 6.5",
            land_type: "Private",
            scheme: "PM-KUSUM",
        },
        expected_closing_date: createdAt,
        source: { from, sub_source: "Campaign" }, // required
        comments: "Seeded via unit test", // required

        current_status: {
            name: statusName,
            stage: "",
            remarks: "created",
            user_id: userId,
        },
        current_assigned: { user_id: userId, status: statusName },

        submitted_by: userId,
        status_of_handoversheet: "false",
        handover_lock: "unlock",
        leadAging: 0,
        inactivedate: createdAt,

        createdAt,
        updatedAt: createdAt,
    };
}

async function seedLeads({ count, userId, createdAt, sourceFrom }) {
    const docs = [];
    for (let i = 0; i < count; i++) {
        docs.push(await Leads.create(makeLeadDoc({ userId, createdAt, sourceFrom })));
    }
    return docs;
}

async function seedOtherLeads({ count, createdAt }) {
    const otherId = new mongoose.Types.ObjectId();
    return seedLeads({ count, userId: otherId, createdAt });
}

// Ensure payment field matches controller: other_details.total_gst
async function seedHandovers({
    count,
    submittedBy,
    createdAt,
    kwps = [],
    services = [], // we’ll copy to total_gst too
}) {
    const docs = Array.from({ length: count }).map((_, i) => {
        const s = (services[i] ?? services[0] ?? "0").toString();
        return {
            createdAt,
            other_details: {
                submitted_by_BD: submittedBy,
                service: s,
                total_gst: s, // controller reads this
            },
            project_detail: {
                project_kwp: (kwps[i] ?? kwps[0] ?? "0").toString(),
            },
        };
    });
    return Handovers.insertMany(docs);
}

async function seedOtherHandovers({ count, createdAt, kwps = [], services = [] }) {
    const docs = Array.from({ length: count }).map((_, i) => {
        const s = (services[i] ?? services[0] ?? "0").toString();
        return {
            createdAt,
            other_details: {
                submitted_by_BD: "Someone Else",
                service: s,
                total_gst: s,
            },
            project_detail: { project_kwp: (kwps[i] ?? kwps[0] ?? "0").toString() },
        };
    });
    return Handovers.insertMany(docs);
}

// Quiet console noise from expected 500s
let consoleErrorSpy;
beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => { });
});
afterAll(() => {
    if (consoleErrorSpy) consoleErrorSpy.mockRestore();
});

beforeEach(() => {
    jest.clearAllMocks();
});


describe("getLeadSummary", () => {
    test("404 when user not found", async () => {
        const fakeUserId = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
            .get("/v1/bddashboard/summary")
            .set("x-test-user-id", fakeUserId);

        expect(res.statusCode).toBe(404);
        expect(res.body?.message).toMatch(/user not found/i);
    });

    test("200 returns summary for NON-privileged user (filters by assignment/name)", async () => {
        const startDate = "2025-02-01T00:00:00.000Z";
        const endDate = "2025-02-28T23:59:59.999Z";
        const prevMid = new Date("2025-01-15T10:00:00.000Z");
        const currMid = new Date("2025-02-15T10:00:00.000Z");

        const userId = new mongoose.Types.ObjectId();
        await seedUser({ _id: userId, name: "Normal User", department: "Accounts", role: "member" });

        await seedLeads({ count: 10, userId, createdAt: currMid });
        await seedLeads({ count: 5, userId, createdAt: prevMid });
        await seedOtherLeads({ count: 3, createdAt: currMid });
        await seedOtherLeads({ count: 1, createdAt: prevMid });

        await seedHandovers({
            count: 4,
            submittedBy: "Normal User",
            createdAt: currMid,
            kwps: ["5000", "4000", "2000", "1500"],
            services: ["2000000", "1800000", "1200000", "600000"],
        });
        await seedHandovers({
            count: 2,
            submittedBy: "Normal User",
            createdAt: prevMid,
            kwps: ["4000", "3000"],
            services: ["1800000", "1000000"],
        });
        await seedOtherHandovers({
            count: 1,
            createdAt: currMid,
            kwps: ["2500"],
            services: ["1000000"],
        });
        await seedOtherHandovers({
            count: 1,
            createdAt: prevMid,
            kwps: ["1000"],
            services: ["500000"],
        });

        const res = await request(app)
            .get("/v1/bddashboard/summary")
            .set("x-test-user-id", userId.toString())
            .query({ startDate, endDate });

        expect(res.status).toBe(200);
        const body = res.body;

        expect(body.total_leads).toBe(10);
        expect(body.total_leads_change_percentage).toBe(100);
        expect(body.conversion_rate_percentage).toBeCloseTo(40, 2);
        expect(body.conversion_rate_change_percentage).toBeCloseTo(0, 2);
        expect(body.total_assigned_tasks).toBe("12.50");
        expect(body.total_assigned_tasks_change_percentage).toBeCloseTo(78.57, 2);
        expect(body.amount_earned).toBeCloseTo(0.56, 2);
        expect(body.amount_earned_change_percentage).toBe(100);
    });

    test("returns 500 when bdleads count fails", async () => {
        const userId = new mongoose.Types.ObjectId();
        await seedUser({ _id: userId, name: "Error User" });

        const spyCount = jest
            .spyOn(Leads, "countDocuments")
            .mockRejectedValueOnce(new Error("DB failed"));

        const res = await request(app)
            .get("/v1/bddashboard/summary")
            .set("x-test-user-id", userId.toString())
            .query({ range: "1 week" });

        expect(res.status).toBe(500);
        expect(res.body?.message).toMatch(/internal server error/i);

        spyCount.mockRestore();
    });
});

describe("getLeadSource", () => {
    test("404 when user not found", async () => {
        const fakeUserId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .get("/v1/bddashboard/lead-source")
            .set("x-test-user-id", fakeUserId);

        expect(res.statusCode).toBe(404);
        expect(res.body?.message).toMatch(/user not found/i);
    });

    test("200 returns percentages by source (non-privileged user)", async () => {
        const userId = new mongoose.Types.ObjectId();
        await seedUser({ _id: userId, name: "Normal", department: "Accounts", role: "member" });

        const createdAt = new Date(Date.now() - 7 * 24 * 3600 * 1000);

        const push = (n, src) => seedLeads({ count: n, userId, createdAt, sourceFrom: src });
        await push(5, "Social Media");
        await push(4, "Marketing");
        await push(7, "IVR/My Operator");
        await push(2, "Referred by");
        await push(2, null); // becomes "Others"

        const otherUser = new mongoose.Types.ObjectId();
        await Leads.create([
            makeLeadDoc({ userId: otherUser, createdAt, sourceFrom: "Marketing" }),
            makeLeadDoc({ userId: otherUser, createdAt, sourceFrom: "Social Media" }),
        ]);

        const res = await request(app)
            .get("/v1/bddashboard/lead-source")
            .set("x-test-user-id", userId.toString())
            .query({ range: "1 month" });

        expect(res.statusCode).toBe(200);
        const map = new Map(res.body.lead_sources.map((x) => [x.source, x.percentage]));
        expect(map.get("Social Media")).toBeCloseTo(25, 2);
        expect(map.get("Marketing")).toBeCloseTo(20, 2);
        expect(map.get("IVR/My Operator")).toBeCloseTo(35, 2);
        expect(map.get("Referred by")).toBeCloseTo(10, 2);
        expect(map.get("Others")).toBeCloseTo(10, 2);
    });

    test("500 on aggregation error", async () => {
        const userId = new mongoose.Types.ObjectId();
        await seedUser({ _id: userId, name: "Z", department: "Accounts", role: "member" });

        const spy = jest.spyOn(Leads, "aggregate").mockRejectedValueOnce(new Error("agg broke"));

        const res = await request(app)
            .get("/v1/bddashboard/lead-source")
            .set("x-test-user-id", userId.toString())
            .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

        expect(res.statusCode).toBe(500);
        expect(res.body?.message).toMatch(/internal server error/i);

        spy.mockRestore();
    });
});

describe("taskDashboard", () => {
    test("404 when user not found", async () => {
        const fakeUserId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .get("/v1/bddashboard/taskdashboard")
            .set("x-test-user-id", fakeUserId.toString())
            .query({ range: "1 week" });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: "User not found" });
    });

    test("200 returns per-member summary for non-privileged user", async () => {
        const userId = new mongoose.Types.ObjectId();
        await seedUser({ _id: userId, name: "Normal", department: "Accounts", role: "member" });

        const res = await request(app)
            .get("/v1/bddashboard/taskdashboard")
            .set("x-test-user-id", userId.toString())
            .query({ range: "1 month" });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("per_member_task_summary");
        expect(Array.isArray(res.body.per_member_task_summary)).toBe(true);
    });

    test("500 when aggregation throws error", async () => {
        const userId = new mongoose.Types.ObjectId();
        await seedUser({ _id: userId, name: "Normal", department: "Accounts", role: "member" });

        const task = require("../../Modells/bdleads/task");
        const spy = jest.spyOn(task, "aggregate").mockRejectedValueOnce(new Error("DB failure"));

        const res = await request(app)
            .get("/v1/bddashboard/taskdashboard")
            .set("x-test-user-id", userId.toString())
            .query({ range: "1 week" });

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty("message", "Internal server error");

        spy.mockRestore();
    });
});

describe("leadSummary", () => {
    test("404 when user not found", async () => {
        const fakeUserId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .get("/v1/bddashboard/lead-summary")
            .set("x-test-user-id", fakeUserId.toString())
            .query({ range: "today" });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty("message", "User not found");
    });

    test("200 maps counts per status", async () => {
        const user = await seedUser({
            name: "Member",
            department: "Accounts",
            role: "member",
        });

        // Seed leads WITHIN January 2025 and assigned to this user
        await Leads.create([
            makeLeadDoc({ userId: user._id, createdAt: new Date("2025-01-05"), statusName: "initial" }),
            makeLeadDoc({ userId: user._id, createdAt: new Date("2025-01-10"), statusName: "initial" }),
            makeLeadDoc({ userId: user._id, createdAt: new Date("2025-01-12"), statusName: "follow up" }),
            makeLeadDoc({ userId: user._id, createdAt: new Date("2025-01-15"), statusName: "warm" }),
            makeLeadDoc({ userId: user._id, createdAt: new Date("2025-01-20"), statusName: "won" }),
            makeLeadDoc({ userId: user._id, createdAt: new Date("2025-01-25"), statusName: "dead" }),
        ]);

        const res = await request(app)
            .get("/v1/bddashboard/lead-summary")
            .set("x-test-user-id", user._id.toString())
            .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

        expect(res.status).toBe(200);
        expect(res.body.lead_status_summary).toEqual({
            initial_leads: 2,
            followup_leads: 1,
            warm_leads: 1,
            won_leads: 1,
            dead_leads: 1,
        });
        expect(res.body.filter_used.from).toMatch(/2025-01-/);
    });

    test("500 on aggregation error", async () => {
        const user = await seedUser({
            name: "Member2",
            department: "Accounts",
            role: "member",
        });

        const spy = jest.spyOn(Leads, "aggregate").mockRejectedValueOnce(new Error("DB failed"));

        const res = await request(app)
            .get("/v1/bddashboard/lead-summary")
            .set("x-test-user-id", user._id.toString())
            .query({ range: "week" });

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty("message", "Internal server error");

        spy.mockRestore();
    });
});

describe("leadconversationrate", () => {
    test("400 when no range and no custom dates", async () => {
        const userId = new mongoose.Types.ObjectId();
        await seedUser({ _id: userId, name: "N", department: "Accounts", role: "member" });

        const res = await request(app)
            .get("/v1/bddashboard/lead-conversation")
            .set("x-test-user-id", userId.toString()); // no range, no dates

        expect(res.statusCode).toBe(400);
        expect(res.body?.message).toMatch(/valid date range/i);
    });

    test("404 when user not found", async () => {
        const res = await request(app)
            .get("/v1/bddashboard/lead-conversation")
            .set("x-test-user-id", new mongoose.Types.ObjectId().toString())
            .query({ range: "1 week" });

        expect(res.statusCode).toBe(404);
    });

    test("200 returns totals and conversion rate", async () => {
        const userId = new mongoose.Types.ObjectId();
        await seedUser({ _id: userId, name: "Acc", department: "Accounts", role: "member" });

        const createdAt = new Date(Date.now() - 2 * 24 * 3600 * 1000);

        await seedLeads({ count: 10, userId, createdAt, sourceFrom: "Marketing" });
        await seedHandovers({
            count: 4,
            submittedBy: "Acc",
            createdAt,
            kwps: ["1000", "2000", "1500", "500"],
            services: ["100000", "200000", "150000", "50000"],
        });

        const res = await request(app)
            .get("/v1/bddashboard/lead-conversation")
            .set("x-test-user-id", userId.toString())
            .query({ range: "1 week" });

        expect(res.statusCode).toBe(200);
        const body = res.body;
        expect(body.total_leads).toBe(10);
        expect(body.total_handovers).toBe(4);
        expect(body.conversion_rate_percentage).toBeCloseTo(40, 2);
    });

    test("500 on error", async () => {
        const userId = new mongoose.Types.ObjectId();
        await seedUser({ _id: userId, name: "Acc", department: "Accounts", role: "member" });

        const spy = jest.spyOn(Leads, "aggregate").mockRejectedValueOnce(new Error("agg err"));

        const res = await request(app)
            .get("/v1/bddashboard/lead-conversation")
            .set("x-test-user-id", userId.toString())
            .query({ range: "1 month" });

        expect(res.statusCode).toBe(500);
        expect(res.body?.message).toMatch(/internal server error/i);

        spy.mockRestore();
    });
});

describe("leadFunnel", () => {
    test("400 when missing range and dates", async () => {
        const userId = new mongoose.Types.ObjectId();
        await seedUser({ _id: userId, name: "N", department: "Accounts", role: "member" });

        const res = await request(app)
            .get("/v1/bddashboard/lead-funnel")
            .set("x-test-user-id", userId.toString()); // no range, no dates

        expect(res.statusCode).toBe(400);
        expect(res.body?.message).toMatch(/valid date range/i);
    });

    test("404 when user not found", async () => {
        const res = await request(app)
            .get("/v1/bddashboard/lead-funnel")
            .set("x-test-user-id", new mongoose.Types.ObjectId().toString())
            .query({ range: "1 week" });

        expect(res.statusCode).toBe(404);
        expect(res.body?.message).toMatch(/user not found/i);
    });

    // test("200 returns funnel with lead counts and capacity + payment", async () => {
    //     const userId = new mongoose.Types.ObjectId();
    //     await seedUser({ _id: userId, name: "Normal", department: "Accounts", role: "member" });

    //     const startDate = "2025-01-01T00:00:00.000Z";
    //     const endDate = "2025-01-31T23:59:59.999Z";
    //     const mid = new Date("2025-01-15T10:00:00.000Z");

    //     await Leads.create([
    //         makeLeadDoc({ userId, createdAt: mid, statusName: "initial", projectCapacity: "5 kWp" }),
    //         makeLeadDoc({ userId, createdAt: mid, statusName: "initial", projectCapacity: "3.5kWp" }),
    //         makeLeadDoc({ userId, createdAt: mid, statusName: "follow up", projectCapacity: "2.0" }),
    //         // warm: none
    //         makeLeadDoc({ userId, createdAt: mid, statusName: "won", projectCapacity: "10" }),
    //         // capacity cannot be blank — use "0"
    //         makeLeadDoc({ userId, createdAt: mid, statusName: "dead", projectCapacity: "0" }),
    //     ]);

    //     await seedHandovers({
    //         count: 2,
    //         submittedBy: "Normal",
    //         createdAt: mid,
    //         kwps: ["1000", "500"],
    //         services: ["10000", "5000"], // will populate total_gst as well
    //     });

    //     const res = await request(app)
    //         .get("/v1/bddashboard/lead-funnel")
    //         .set("x-test-user-id", userId.toString())
    //         .query({ startDate, endDate, fields: "lead,capacity" });

    //     expect(res.statusCode).toBe(200);
    //     const body = res.body;

    //     expect(body.initial.count).toBe(2);
    //     expect(body.initial.capacity).toBeCloseTo(8.5, 2);

    //     expect(body["follow up"].count).toBe(1);
    //     expect(body["follow up"].capacity).toBeCloseTo(2.0, 2);

    //     expect(body.warm.count).toBe(0);
    //     expect(body.warm.capacity).toBeCloseTo(0.0, 2);

    //     expect(body.won.count).toBe(1);
    //     expect(body.won.capacity).toBeCloseTo(10.0, 2);

    //     expect(body.dead.count).toBe(1);
    //     expect(body.dead.capacity).toBeCloseTo(0.0, 2);

    //     expect(body.payment).toBe(15000);
    // });
});

describe("leadWonAndLost", () => {
    test("404 when user not found", async () => {
        const fakeUserId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .get("/v1/bddashboard/wonandlost")
            .set("x-test-user-id", fakeUserId)
            .query({ startDate: "2025-01-01", endDate: "2025-03-31" });

        expect(res.statusCode).toBe(404);
        expect(res.body?.message).toMatch(/user not found/i);
    });

    test("200 returns correct totals, percentages, and monthly data (non-privileged user)", async () => {
        const userId = new mongoose.Types.ObjectId();
        const userName = "Normal";
        await seedUser({ _id: userId, name: userName, department: "Accounts", role: "member" });

        const startDate = "2025-01-01T00:00:00.000Z";
        const endDate = "2025-03-31T23:59:59.999Z";
        const janMid = new Date("2025-01-15T10:00:00.000Z");
        const febMid = new Date("2025-02-10T10:00:00.000Z");

        await Leads.create([
            // January
            makeLeadDoc({ userId, createdAt: janMid, statusName: "initial", projectCapacity: "5 kWp" }),
            makeLeadDoc({ userId, createdAt: janMid, statusName: "initial", projectCapacity: "3.5 kWp" }),
            makeLeadDoc({ userId, createdAt: janMid, statusName: "follow up", projectCapacity: "2.0" }),
            makeLeadDoc({ userId, createdAt: janMid, statusName: "warm", projectCapacity: "1.0" }),
            makeLeadDoc({ userId, createdAt: janMid, statusName: "dead", projectCapacity: "0" }),
            makeLeadDoc({ userId, createdAt: janMid, statusName: "won", projectCapacity: "10" }),
            // February
            makeLeadDoc({ userId, createdAt: febMid, statusName: "initial", projectCapacity: "2.0" }),
            makeLeadDoc({ userId, createdAt: febMid, statusName: "dead", projectCapacity: "0" }),
            makeLeadDoc({ userId, createdAt: febMid, statusName: "won", projectCapacity: "1.0" }),
            makeLeadDoc({ userId, createdAt: febMid, statusName: "won", projectCapacity: "1.5" }),
        ]);

        const otherUser = new mongoose.Types.ObjectId();
        await Leads.create([
            makeLeadDoc({ userId: otherUser, createdAt: janMid, sourceFrom: "Social Media", statusName: "won", projectCapacity: "5" }),
            makeLeadDoc({ userId: otherUser, createdAt: febMid, sourceFrom: "Social Media", statusName: "dead", projectCapacity: "0" }),
        ]);

        await seedHandovers({
            count: 4,
            submittedBy: userName,
            createdAt: janMid,
            kwps: ["1000", "500", "250", "250"],
            services: ["10000", "5000", "2000", "3000"],
        });
        await seedOtherHandovers({
            count: 2,
            createdAt: febMid,
            kwps: ["1000", "500"],
            services: ["10000", "5000"],
        });

        const res = await request(app)
            .get("/v1/bddashboard/wonandlost")
            .set("x-test-user-id", userId.toString())
            .query({ startDate, endDate });

        expect(res.statusCode).toBe(200);
        const body = res.body;

        expect(body.total_leads).toBe(10);
        expect(body.active_leads).toBe(5);
        expect(body.lost_leads).toBe(2);
        expect(body.won_leads).toBe(3);
        expect(body.won_leads_percentage).toBeCloseTo(30.0, 2);
        expect(body.lost_leads_percentage).toBeCloseTo(20.0, 2);
        expect(body.conversion_rate_percentage).toBeCloseTo(40.0, 2);

        const jan = body.monthly_data.find((m) => m.month === "Jan");
        const feb = body.monthly_data.find((m) => m.month === "Feb");
        const mar = body.monthly_data.find((m) => m.month === "Mar");

        expect(jan).toBeTruthy();
        expect(feb).toBeTruthy();
        expect(mar).toBeTruthy();

        expect(jan.won_percentage).toBeCloseTo(20.0, 2);
        expect(jan.lost_percentage).toBeCloseTo(20.0, 2);

        expect(feb.won_percentage).toBeCloseTo(100.0, 2);
        expect(feb.lost_percentage).toBeCloseTo(50.0, 2);

        expect(mar.won_percentage).toBeCloseTo(0.0, 2);
        expect(mar.lost_percentage).toBeCloseTo(0.0, 2);

        expect(body.isPrivilegedUser).toBe(false);
    });

    test("200 privileged user sees all leads", async () => {
        const adminId = new mongoose.Types.ObjectId();
        await seedUser({ _id: adminId, name: "Admin", department: "admin", role: "member" });

        const startDate = "2025-02-01T00:00:00.000Z";
        const endDate = "2025-02-28T23:59:59.999Z";
        const febMid = new Date("2025-02-10T10:00:00.000Z");

        const u1 = new mongoose.Types.ObjectId();
        const u2 = new mongoose.Types.ObjectId();
        await seedUser({ _id: u1, name: "A", department: "BD", role: "member" });
        await seedUser({ _id: u2, name: "B", department: "Accounts", role: "member" });

        await Leads.create([
            makeLeadDoc({ userId: u1, createdAt: febMid, statusName: "initial", projectCapacity: "1" }),
            makeLeadDoc({ userId: u2, createdAt: febMid, statusName: "won", projectCapacity: "1" }),
            makeLeadDoc({ userId: u2, createdAt: febMid, statusName: "dead", projectCapacity: "0" }),
        ]);

        const res = await request(app)
            .get("/v1/bddashboard/wonandlost")
            .set("x-test-user-id", adminId.toString())
            .query({ startDate, endDate });

        expect(res.statusCode).toBe(200);
        const body = res.body;

        expect(body.total_leads).toBe(3);
        expect(body.won_leads).toBe(1);
        expect(body.lost_leads).toBe(1);
        expect(body.active_leads).toBe(1);
        expect(body.isPrivilegedUser).toBe(true);
    });

    test("500 on unexpected error (countDocuments throws)", async () => {
        const userId = new mongoose.Types.ObjectId();
        await seedUser({ _id: userId, name: "ErrUser", department: "Accounts", role: "member" });

        const spy = jest.spyOn(Leads, "countDocuments").mockRejectedValueOnce(new Error("DB failed"));

        const res = await request(app)
            .get("/v1/bddashboard/wonandlost")
            .set("x-test-user-id", userId.toString())
            .query({ range: "1 week" });

        expect(res.statusCode).toBe(500);
        expect(res.body?.message).toMatch(/internal server error/i);

        spy.mockRestore();
    });
});
