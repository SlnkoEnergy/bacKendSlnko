// NEW FILE: src/tests/unit/dashboard.controllers.unit.test.js
// Adjust the import path below to match where you saved the controller file.
const mongoose = require("mongoose");

// ---- Mock all DB models used by the controllers ----
jest.mock("../../Modells/handoversheet.model", () => ({
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    find: jest.fn(),
}));
jest.mock("../../Modells/bdleads/task", () => ({
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
}));
jest.mock("../../Modells/bdleads/bdleadsModells", () => ({
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    find: jest.fn(),
}));
jest.mock("../../Modells/users/userModells", () => ({
    findById: jest.fn(),
}));

// ---- Import mocks & controller under test ----
const handoversheet = require("../../Modells/handoversheet.model");
const task = require("../../Modells/bdleads/task");
const bdleadsModells = require("../../Modells/bdleads/bdleadsModells");
const userModells = require("../../Modells/users/userModells");

// ⬇️ Update this path if your file name is different.
// const {
//     getLeadSummary,
//     getLeadSource,
//     taskDashboard,
//     leadSummary,
//     leadconversationrate,
//     leadFunnel,
//     leadWonAndLost,
// } = require("../../Controllers/dashboard"); // <-- adjust if needed

// ---- Helpers ----
const makeRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const setUser = (user) => {
    // userModells.findById returns a Query-like object with .lean()
    userModells.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(user),
    });
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe("getLeadSummary", () => {
    test("404 when user not found", async () => {
        setUser(null);
        const req = { user: { userId: "U1" }, query: { range: "1 month" } };
        const res = makeRes();

        await getLeadSummary(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json.mock.calls[0][0].message).toMatch(/user not found/i);
    });

    test("200 returns summary for non-privileged user", async () => {
        setUser({ _id: "U2", name: "Normal User", department: "Accounts", role: "member" });

        // bd leads – current, previous
        bdleadsModells.countDocuments
            .mockResolvedValueOnce(10) // current totalLeads
            .mockResolvedValueOnce(5); // prevTotalLeads

        // handovers – current, previous
        handoversheet.countDocuments
            .mockResolvedValueOnce(4) // totalHandovers
            .mockResolvedValueOnce(2); // prevHandovers

        // handovers aggregate for KWP (current, prev)
        handoversheet.aggregate
            .mockResolvedValueOnce([{ total: 12.5 }]) // currentKwp
            .mockResolvedValueOnce([{ total: 7 }]) // prevKwp
            // earnings (current, prev)
            .mockResolvedValueOnce([{ total: 5600000 }]) // current earning
            .mockResolvedValueOnce([{ total: 2800000 }]); // prev earning

        const req = { user: { userId: "U2" }, query: { range: "1 month" } };
        const res = makeRes();

        await getLeadSummary(req, res);

        expect(res.status).not.toHaveBeenCalled(); // default 200
        const body = res.json.mock.calls[0][0];

        expect(body.total_leads).toBe(10);
        expect(body.total_leads_change_percentage).toBe(100); // (10-5)/5 * 100
        expect(body.conversion_rate_percentage).toBe(40); // 4/10 * 100
        expect(body.conversion_rate_change_percentage).toBe(0); // 40 vs 40

        expect(body.total_assigned_tasks).toBe("12.50"); // toFixed(2) string
        expect(body.total_assigned_tasks_change_percentage).toBe(78.57); // (12.5-7)/7*100

        expect(body.amount_earned).toBe(0.56); // 5.6M / 10M
        expect(body.amount_earned_change_percentage).toBe(100);
    });

    test("500 on unexpected error", async () => {
        setUser({ _id: "U3", name: "X", department: "Accounts", role: "member" });
        bdleadsModells.countDocuments.mockRejectedValue(new Error("DB failed"));

        const req = { user: { userId: "U3" }, query: { range: "1 week" } };
        const res = makeRes();

        await getLeadSummary(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json.mock.calls[0][0].message).toMatch(/internal server error/i);
    });
});

describe("getLeadSource", () => {
    test("404 when user not found", async () => {
        setUser(null);
        const req = { user: { userId: "U1" }, query: { range: "1 month" } };
        const res = makeRes();

        await getLeadSource(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json.mock.calls[0][0].message).toMatch(/user not found/i);
    });

    test("200 returns percentages by source", async () => {
        setUser({ _id: "U4", name: "Normal", department: "Accounts", role: "member" });

        // Controller's pipeline ends with project -> [{ sources: [{source, percentage}, ...] }]
        bdleadsModells.aggregate.mockResolvedValueOnce([
            {
                sources: [
                    { source: "Social Media", percentage: 25.0 },
                    { source: "Marketing", percentage: 20.0 },
                    { source: "IVR/My Operator", percentage: 35.0 },
                    { source: "Referred by", percentage: 10.0 },
                    { source: null, percentage: 10.0 }, // Will roll into "Others"
                ],
            },
        ]);

        const req = { user: { userId: "U4" }, query: { range: "1 month" } };
        const res = makeRes();

        await getLeadSource(req, res);

        const body = res.json.mock.calls[0][0];
        expect(body.lead_sources).toBeTruthy();
        const map = new Map(body.lead_sources.map((x) => [x.source, x.percentage]));

        expect(map.get("Social Media")).toBeCloseTo(25, 2);
        expect(map.get("Marketing")).toBeCloseTo(20, 2);
        expect(map.get("IVR/My Operator")).toBeCloseTo(35, 2);
        expect(map.get("Referred by")).toBeCloseTo(10, 2);
        expect(map.get("Others")).toBeCloseTo(10, 2);
    });

    test("500 on error", async () => {
        setUser({ _id: "U5", name: "Z", department: "Accounts", role: "member" });
        bdleadsModells.aggregate.mockRejectedValue(new Error("agg broke"));

        const req = { user: { userId: "U5" }, query: { startDate: "2025-01-01", endDate: "2025-01-31" } };
        const res = makeRes();

        await getLeadSource(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe("taskDashboard", () => {
    test("404 when user not found", async () => {
        setUser(null);
        const req = { user: { userId: "U1" }, query: { range: "1 week" } };
        const res = makeRes();

        await taskDashboard(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test("200 returns per-member summary for non-privileged user", async () => {
        setUser({ _id: new mongoose.Types.ObjectId(), name: "Normal", department: "Accounts", role: "member" });

        task.aggregate.mockResolvedValueOnce([
            { user_id: "U9", name: "Normal", assigned_tasks: 4, completed_tasks: 1 },
        ]);

        const req = { user: { userId: "U9" }, query: { range: "1 month" } };
        const res = makeRes();

        await taskDashboard(req, res);

        const body = res.json.mock.calls[0][0];
        expect(body.per_member_task_summary).toHaveLength(1);
        expect(body.per_member_task_summary[0].assigned_tasks).toBe(4);
    });

    test("200 returns multiple entries for privileged user", async () => {
        setUser({ _id: "ADM1", name: "Admin", department: "admin", role: "member" });
        task.aggregate.mockResolvedValueOnce([
            { user_id: "A", name: "A", assigned_tasks: 2, completed_tasks: 1 },
            { user_id: "B", name: "B", assigned_tasks: 5, completed_tasks: 3 },
        ]);

        const req = { user: { userId: "ADM1" }, query: { range: "1 week" } };
        const res = makeRes();

        await taskDashboard(req, res);
        const body = res.json.mock.calls[0][0];
        expect(body.per_member_task_summary).toHaveLength(2);
    });
});

describe("leadSummary", () => {
    test("404 when user not found", async () => {
        setUser(null);
        const req = { user: { userId: "X" }, query: { range: "today" } };
        const res = makeRes();

        await leadSummary(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test("200 maps counts per status", async () => {
        setUser({ _id: "U7", name: "Member", department: "Accounts", role: "member" });
        bdleadsModells.aggregate.mockResolvedValueOnce([
            { _id: "initial", count: 3 },
            { _id: "follow up", count: 2 },
            { _id: "warm", count: 4 },
            { _id: "won", count: 1 },
            { _id: "dead", count: 5 },
        ]);

        const req = { user: { userId: "U7" }, query: { startDate: "2025-01-01", endDate: "2025-01-31" } };
        const res = makeRes();

        await leadSummary(req, res);

        const body = res.json.mock.calls[0][0];
        expect(body.lead_status_summary.initial_leads).toBe(3);
        expect(body.lead_status_summary.followup_leads).toBe(2);
        expect(body.lead_status_summary.warm_leads).toBe(4);
        expect(body.lead_status_summary.won_leads).toBe(1);
        expect(body.lead_status_summary.dead_leads).toBe(5);
        expect(body.filter_used.from).toMatch(/2025-01-/);
    });

    test("500 on error", async () => {
        setUser({ _id: "U8", name: "Member", department: "Accounts", role: "member" });
        bdleadsModells.aggregate.mockRejectedValue(new Error("oops"));

        const req = { user: { userId: "U8" }, query: { range: "week" } };
        const res = makeRes();

        await leadSummary(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe("leadconversationrate", () => {
    test("400 when no range and no custom dates", async () => {
        setUser({ _id: "U1", name: "N", department: "Accounts", role: "member" });
        const req = { user: { userId: "U1" }, query: {} };
        const res = makeRes();

        await leadconversationrate(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/valid date range/i);
    });

    test("404 when user not found", async () => {
        setUser(null);
        const req = { user: { userId: "Z" }, query: { range: "1 week" } };
        const res = makeRes();

        await leadconversationrate(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test("200 returns totals and conversion rate", async () => {
        setUser({ _id: "U2", name: "Acc", department: "Accounts", role: "member" });

        bdleadsModells.aggregate.mockResolvedValueOnce([{ totalLeads: 10 }]);
        handoversheet.countDocuments.mockResolvedValueOnce(4);

        const req = { user: { userId: "U2" }, query: { range: "1 week" } };
        const res = makeRes();

        await leadconversationrate(req, res);

        const body = res.json.mock.calls[0][0];
        expect(body.total_leads).toBe(10);
        expect(body.total_handovers).toBe(4);
        expect(body.conversion_rate_percentage).toBeCloseTo(40, 2);
    });

    test("500 on error", async () => {
        setUser({ _id: "U3", name: "Acc", department: "Accounts", role: "member" });
        bdleadsModells.aggregate.mockRejectedValue(new Error("agg err"));

        const req = { user: { userId: "U3" }, query: { range: "1 month" } };
        const res = makeRes();

        await leadconversationrate(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe("leadFunnel", () => {
    test("400 when missing range and dates", async () => {
        setUser({ _id: "U1", name: "N", department: "Accounts", role: "member" });
        const req = { user: { userId: "U1" }, query: {} };
        const res = makeRes();

        await leadFunnel(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test("404 when user not found", async () => {
        setUser(null);
        const req = { user: { userId: "U1" }, query: { range: "1 week" } };
        const res = makeRes();

        await leadFunnel(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test("200 returns funnel with lead counts and capacity + payment", async () => {
        setUser({ _id: "U2", name: "Normal", department: "Accounts", role: "member" });

        // The controller loops stages: ["initial", "follow up", "warm", "won", "dead"]
        // It calls bdleadsModells.find(stageFilter) per stage -> respond in order:
        bdleadsModells.find
            // initial (count 2, caps 5 + 3.5)
            .mockResolvedValueOnce([{ capacity: "5 kWp" }, { capacity: "3.5kWp" }])
            // follow up (count 1, cap 2)
            .mockResolvedValueOnce([{ capacity: "2.0" }])
            // warm (count 0)
            .mockResolvedValueOnce([])
            // won (count 1, cap 10)
            .mockResolvedValueOnce([{ capacity: "10" }])
            // dead (count 1, cap blank)
            .mockResolvedValueOnce([{ capacity: "" }]);

        // For payment block (handovers within date range)
        handoversheet.find.mockResolvedValueOnce([
            { other_details: { total_gst: "10000" } },
            { other_details: { total_gst: "5000" } },
        ]);

        const req = {
            user: { userId: "U2" },
            query: { startDate: "2025-01-01", endDate: "2025-01-31", fields: "lead,capacity" },
        };
        const res = makeRes();

        await leadFunnel(req, res);
        const body = res.json.mock.calls[0][0];

        expect(body.initial.count).toBe(2);
        expect(body.initial.capacity).toBeCloseTo(8.5, 2);
        expect(body["follow up"].count).toBe(1);
        expect(body["follow up"].capacity).toBeCloseTo(2.0, 2);
        expect(body.won.count).toBe(1);
        expect(body.won.capacity).toBeCloseTo(10.0, 2);
        expect(body.dead.count).toBe(1);
        expect(body.dead.capacity).toBeCloseTo(0.0, 2);
        expect(body.payment).toBe(15000);
    });
});

describe("leadWonAndLost", () => {
    test("404 when user not found", async () => {
        setUser(null);
        const req = { user: { userId: "U1" }, query: { startDate: "2025-01-01", endDate: "2025-03-31" } };
        const res = makeRes();

        await leadWonAndLost(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test("200 returns totals, percentages, conversion and monthly data", async () => {
        setUser({ _id: "U2", name: "Normal", department: "Accounts", role: "member" });

        // countDocuments for statuses (order in controller):
        // won, follow up, warm, dead, initial
        bdleadsModells.countDocuments
            .mockResolvedValueOnce(2) // wonCount
            .mockResolvedValueOnce(3) // followUpCount
            .mockResolvedValueOnce(5) // warmCount
            .mockResolvedValueOnce(4) // deadCount
            .mockResolvedValueOnce(6); // initialCount

        // handovers + tasks (tasks not used in calc, but present)
        handoversheet.countDocuments.mockResolvedValueOnce(8);
        task.countDocuments.mockResolvedValueOnce(42);

        // aggregateByStatus is called for "won", "follow up", "warm", "dead", "initial"
        // We inspect the first pipeline stage's $match.current_status.name to branch:
        bdleadsModells.aggregate.mockImplementation((pipeline) => {
            const status = pipeline?.[0]?.$match?.["current_status.name"];
            if (status === "won") {
                return Promise.resolve([
                    { _id: { month: 1, year: 2025 }, count: 2 },
                    { _id: { month: 2, year: 2025 }, count: 1 },
                ]);
            }
            if (status === "dead") {
                return Promise.resolve([
                    { _id: { month: 1, year: 2025 }, count: 1 },
                    { _id: { month: 2, year: 2025 }, count: 2 },
                ]);
            }
            if (status === "follow up") {
                return Promise.resolve([
                    { _id: { month: 1, year: 2025 }, count: 3 },
                    { _id: { month: 2, year: 2025 }, count: 2 },
                ]);
            }
            if (status === "warm") {
                return Promise.resolve([
                    { _id: { month: 1, year: 2025 }, count: 2 },
                    { _id: { month: 2, year: 2025 }, count: 2 },
                ]);
            }
            if (status === "initial") {
                return Promise.resolve([
                    { _id: { month: 1, year: 2025 }, count: 5 },
                    { _id: { month: 2, year: 2025 }, count: 1 },
                ]);
            }
            return Promise.resolve([]);
        });

        const req = {
            user: { userId: "U2" },
            query: { startDate: "2025-01-01", endDate: "2025-03-31" },
        };
        const res = makeRes();

        await leadWonAndLost(req, res);

        const body = res.json.mock.calls[0][0];
        expect(body.total_leads).toBe(20); // 2 + 3 + 5 + 4 + 6
        expect(body.active_leads).toBe(14); // follow up + warm + initial
        expect(body.lost_leads).toBe(4);
        expect(body.won_leads).toBe(2);
        expect(body.won_leads_percentage).toBeCloseTo(10.0, 2);
        expect(body.lost_leads_percentage).toBeCloseTo(20.0, 2);
        expect(body.conversion_rate_percentage).toBeCloseTo(40.0, 2); // 8 / 20 * 100

        expect(Array.isArray(body.monthly_data)).toBe(true);
        expect(body.monthly_data.length).toBeGreaterThanOrEqual(3); // Jan–Mar
        // We can spot check the first month (Jan)
        const jan = body.monthly_data.find((m) => m.month === "Jan");
        expect(jan).toBeTruthy();
        expect(jan.won_percentage).toBeGreaterThanOrEqual(0);
        expect(jan.lost_percentage).toBeGreaterThanOrEqual(0);
    });
});
