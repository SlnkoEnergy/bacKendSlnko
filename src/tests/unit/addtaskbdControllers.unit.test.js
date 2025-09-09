const mongoose = require("mongoose");
const request = require("supertest");

jest.mock("../../middlewares/auth", () => ({
    authentication: (req, res, next) => {
        const id = req.headers["x-test-user-id"];
        if (id) req.user = { userId: id };
        next();
    },
    authorization: (req, res, next) => next(),
}));

const AddTask = require("../../Modells/addtaskbdModells");
const taskHistory = require("../../Modells/addtaskbdHistoryModells");


describe("POST /v1/add-task", () => {
    test("creates a task and a history entry; sets notification for 'By Meeting'", async () => {
        const body = {
            id: unique("ID"),
            name: "Follow up client",
            date: "2025-09-08",
            reference: "By Meeting",
            by_whom: "Siddharth",
            comment: "Discuss payment terms",
            submitted_by: "Disha",
            task_detail: "Call client and confirm PO timeline",
        };

        const res = await request(app)
            .post("/v1/add-task")
            .set("x-test-user-id", new mongoose.Types.ObjectId().toString())
            .send(body);

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty("message", "Task Added Successfully");
        expect(res.body).toHaveProperty("task");

        const saved = await AddTask.findOne({ id: body.id }).lean();
        expect(saved).toBeTruthy();
        expect(saved.status).toBe("Add");
        expect(saved.notification_message).toMatch(/a new task "Follow up client" has been assigned/i);
        expect(saved.by_whom).toBe("Siddharth");

        const hist = await TaskHistory.findOne({ id: body.id }).lean();
        expect(hist).toBeTruthy();
        expect(hist.name).toBe(body.name);
        expect(hist.task_detail).toBe(body.task_detail);
    });

    test("creates with minimal body using defaults (no meeting notification)", async () => {
        const body = {
            name: "Generic task",
            submitted_by: "Ops",
        };

        const res = await request(app)
            .post("/v1/add-task")
            .set("x-test-user-id", new mongoose.Types.ObjectId().toString())
            .send(body);

        expect(res.status).toBe(201);
        const saved = await AddTask.findOne({ name: "Generic task" }).lean();
        expect(saved).toBeTruthy();
        expect(saved.status).toBe("Add");
        // no meeting => notification empty string or undefined depending on your controller
        expect(saved.notification_message || "").toBe("");
        const hist = await TaskHistory.findOne({ name: "Generic task" }).lean();
        expect(hist).toBeTruthy();
    });
});

describe("GET /v1/get-all-task (pagination & filters)", () => {
    beforeEach(async () => {
        // Seed 15 tasks with varied values and controlled createdAt timestamps
        const now = new Date("2025-09-08T12:00:00.000Z");
        const docs = [];

        for (let i = 0; i < 15; i++) {
            docs.push({
                id: unique("ID"),
                name: i % 3 === 0 ? `Alpha ${i}` : `Bravo ${i}`,
                date: "2025-09-08",
                reference: i % 2 === 0 ? "By Meeting" : "Manual",
                by_whom: i % 2 === 0 ? "Siddharth" : "Disha",
                comment: i % 4 === 0 ? "urgent client meeting" : "regular",
                task_detail: i % 5 === 0 ? "contains keyword needle" : "no keyword",
                status: i % 2 === 0 ? "Add" : "Pending",
                submitted_by: i % 2 === 0 ? "Ops" : "Sales",
                createdAt: new Date(now.getTime() - i * 60 * 60 * 1000), // hourly steps
                updatedAt: new Date(now.getTime() - i * 60 * 60 * 1000),
            });
        }
        await AddTask.insertMany(docs);
    });

    test("returns paginated results (page=2, limit=5)", async () => {
        const res = await request(app)
            .get("/v1/get-all-task?page=2&limit=5")
            .set("x-test-user-id", new mongoose.Types.ObjectId().toString());

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("data");
        expect(res.body.data.length).toBe(5);
        expect(res.body).toHaveProperty("page", 2);
        expect(res.body).toHaveProperty("limit", 5);
        expect(res.body).toHaveProperty("total", 15);
        expect(res.body).toHaveProperty("pages", 3);
        // Sorted by createdAt desc by controller: first page has newest 5, second page next 5
    });

    test("filters by text search (q) across multiple fields", async () => {
        // 'needle' appears in task_detail every 5th item (i % 5 === 0) => indices 0,5,10 => 3 docs
        const res = await request(app)
            .get("/v1/get-all-task?q=needle")
            .set("x-test-user-id", new mongoose.Types.ObjectId().toString());

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(3);
        expect(res.body.data.length).toBe(3);
        // ensure one of them has task_detail containing 'needle'
        expect(res.body.data.some(d => /needle/i.test(d.task_detail))).toBe(true);
    });

    test("filters by by_whom", async () => {
        const res = await request(app)
            .get("/v1/get-all-task?by_whom=Siddharth")
            .set("x-test-user-id", new mongoose.Types.ObjectId().toString());

        expect(res.status).toBe(200);
        // Half are Siddharth (i % 2 === 0) => 8 out of 15 (indices 0..14 => 0,2,4,6,8,10,12,14)
        expect(res.body.total).toBe(8);
        expect(res.body.data.every(d => d.by_whom === "Siddharth")).toBe(true);
    });

    test("filters by status", async () => {
        const res = await request(app)
            .get("/v1/get-all-task?status=Pending")
            .set("x-test-user-id", new mongoose.Types.ObjectId().toString());

        expect(res.status).toBe(200);
        // Half are Pending (i % 2 === 1) => 7 out of 15 (indices 1,3,5,7,9,11,13)
        expect(res.body.total).toBe(7);
        expect(res.body.data.every(d => d.status === "Pending")).toBe(true);
    });

    test("filters by createdAt range (from/to)", async () => {
        
        const from = "2025-09-08T09:30:00.000Z";
        const to = "2025-09-08T12:00:00.000Z";

        const res = await request(app)
            .get(`/v1/get-all-task?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
            .set("x-test-user-id", new mongoose.Types.ObjectId().toString());

        expect(res.status).toBe(200);
        // Rough check: created at 12:00, 11:00, 10:00 (3 items) and possibly 9:00 excluded
        expect(res.body.total).toBeGreaterThanOrEqual(3);
        expect(res.body.total).toBeLessThanOrEqual(4);

        // All returned items must be within range
        const inRange = res.body.data.every(d => {
            const created = new Date(d.createdAt).getTime();
            return created >= new Date(from).getTime() && created <= new Date(to).getTime();
        });
        expect(inRange).toBe(true);
    });
});