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

try {
    jest.mock("@novu/node", () => ({
        Novu: jest.fn().mockImplementation(() => ({})),
    }));
} catch (e) { }
try {
    jest.mock("novu", () => ({
        Novu: jest.fn().mockImplementation(() => ({})),
    }));
} catch (e) { }

const Task = require("../../Modells/bdleads/task");
const User = require("../../Modells/users/userModells")
const DeadLead = require("../../Modells/deadleadModells")
const Lead = require("../../Modells/bdleads/bdleadsModells")
const app = require("../../index")

describe("POST /v1/bddashboard/bd-tasks", () => {
    let lead;
    let user;

    beforeEach(async () => {
        await Task.deleteMany({});
        await Lead.deleteMany({});
        await User.deleteMany({});

        // Create a dummy user
        user = await User.create({
            name: "Task User",
            emp_id: "EMP001",
            email: "taskuser@test.com",
            password: "password123",
        });

        // Create a dummy lead
        lead = await Lead.create({
            name: "Task Lead",
            company_name: "Company Ltd",
            contact_details: { mobile: ["9876543210"] },
            address: { village: "VillageX", district: "DistrictY", state: "StateZ" },
            project_details: { capacity: "20MW" },
            source: { from: "Referral" },
            comments: "Test lead for task creation",
        });
    });

    test("should return 400 if lead_id is invalid", async () => {
        const fakeId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .post("/v1/bddashboard/bd-tasks")
            .set("x-test-user-id", user._id.toString())
            .send({
                title: "Invalid Lead Task",
                lead_id: fakeId,
                user_id: user._id,
                type: "meeting",
                assigned_to: [user._id],
                deadline: new Date(),
                priority: "high",
                description: "This should fail",
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("Invalid lead_id");
    });

    test("should create task successfully", async () => {
        const res = await request(app)
            .post("/v1/bddashboard/bd-tasks")
            .set("x-test-user-id", user._id.toString())
            .send({
                title: "Project Discussion",
                lead_id: lead._id,
                user_id: user._id,
                type: "meeting",
                assigned_to: [user._id],
                deadline: new Date(),
                priority: "medium",
                description: "Discuss upcoming project milestones",
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.message).toBe("Task created successfully");
        expect(res.body.task).toHaveProperty("_id");
        expect(res.body.task.title).toBe("Project Discussion");
        expect(res.body.task.lead_id).toBe(String(lead._id));

        const taskInDb = await Task.find();
        expect(taskInDb.length).toBe(1);
        expect(taskInDb[0].description).toBe("Discuss upcoming project milestones");
    });

    // test("should handle server error gracefully", async () => {
    //     const res = await request(app)
    //         .post("/v1/bddashboard/bd-tasks")
    //         .set("x-test-user-id", user._id.toString())
    //         .send({
    //             title: "Server Error Task",
    //             lead_id: new mongoose.Types.ObjectId(),
    //             user_id: new mongoose.Types.ObjectId(),
    //             type: "call",
    //             assigned_to: [user._id],
    //             deadline: new Date(),
    //             priority: "low",
    //             description: "This should trigger 500",
    //         });

    //     expect(res.statusCode).toBe(500);
    //     expect(res.body.error).toBe("Internal Server Error");
    // });
});

describe("PUT /v1/bddashboard/bd-tasks/:_id/status", () => {
    let lead, task, userId;

    beforeEach(async () => {
        await Task.deleteMany({});
        await Lead.deleteMany({});

        userId = new mongoose.Types.ObjectId();

        // create a lead
        lead = await Lead.create({
            name: "Lead A",
            company_name: "Company A",
            contact_details: { email: "a@test.com", mobile: ["9999999999"] },
            address: { village: "X", district: "Y", state: "Z" },
            project_details: { capacity: "1MW" },
            source: { from: "Referral" },
            comments: "Test lead",
        });

        // create a task for that lead
        task = await Task.create({
            title: "Initial Task",
            lead_id: lead._id,   // ✅ Must exist
            user_id: userId,
            type: "call",
            assigned_to: [userId],
            deadline: new Date(),
            priority: "high",
            description: "Initial Task Description",
        });
    });



    test("should return 400 if status is missing", async () => {
        const res = await request(app)
            .put(`/v1/bddashboard/${task._id}/updateStatus`)
            .set("x-test-user-id", userId.toString())
            .send({ remarks: "Forgot to add status" });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("Status is required");
    });

    test("should return 404 if task not found", async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app)
            .put(`/v1/bddashboard/${fakeId}/updateStatus`)
            .set("x-test-user-id", userId.toString())
            .send({ status: "completed", remarks: "Nonexistent task" });

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe("Task not found");
    });

    // test("should update task status successfully", async () => {
    //     const res = await request(app)
    //         .put(`/v1/bddashboard/${task._id}/status`)
    //         .set("x-test-user-id", userId.toString())
    //         .send({ status: "in-progress", remarks: "Working on it", user_id: userId });

    //     expect(res.statusCode).toBe(200);
    //     expect(res.body.message).toBe("Task status updated successfully");
    //     expect(res.body.data.status_history.length).toBe(1);
    //     expect(res.body.data.status_history[0].status).toBe("in-progress");

    //     // check DB updated
    //     const updatedTask = await Task.findById(task._id);
    //     expect(updatedTask.status_history[0].status).toBe("in-progress");

    //     const updatedLead = await Lead.findById(lead._id);
    //     expect(updatedLead.inactivedate).not.toBeNull();
    // });

});

describe("GET /v1/bddashboard/all-tasks", () => {
    let user, lead, task1, task2;

    beforeEach(async () => {
        await Task.deleteMany({});
        await Lead.deleteMany({});
        await User.deleteMany({});

        // Create a user
        user = await User.create({
            name: "Test User",
            emp_id: "EMP002",
            email: "testuser@test.com",
            password: "password123",
            department: "BD",
            role: "employee",
        });

        // Create a lead
        lead = await Lead.create({
            name: "Search Lead",
            company_name: "Search Co",
            contact_details: { mobile: ["8888888888"] },
            address: { village: "Alpha", district: "Beta", state: "Gamma" },
            project_details: { capacity: "10MW" },
            source: { from: "Referral" },
            comments: "Testing search",
        });

        // Create tasks
        task1 = await Task.create({
            title: "Call with client",
            lead_id: lead._id,
            user_id: user._id,
            type: "call",
            assigned_to: [user._id],
            deadline: new Date("2025-09-10"),
            priority: "high",
            description: "Discuss project details",
            current_status: "pending",
        });

        task2 = await Task.create({
            title: "Prepare Proposal",
            lead_id: lead._id,
            user_id: user._id,
            type: "meeting",
            assigned_to: [user._id],
            deadline: new Date("2025-09-15"),
            priority: "medium",
            description: "Draft proposal for client",
            current_status: "completed",
        });
    });

    test("should fetch all tasks for logged-in user", async () => {
        const res = await request(app)
            .get("/v1/bddashboard/all-tasks")
            .set("x-test-user-id", user._id.toString());

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.length).toBe(2);
        expect(res.body.total).toBe(2);
    });

    // test("should filter tasks by status", async () => {
    //     const res = await request(app)
    //         .get("/v1/bddashboard/all-tasks")
    //         .set("x-test-user-id", user._id.toString())
    //         .query({ status: "completed" });

    //     expect(res.statusCode).toBe(200);
    //     expect(res.body.data.length).toBe(1);
    //     expect(res.body.data[0].current_status).toBe("completed");
    // });

    test("should filter tasks by deadline range", async () => {
        const res = await request(app)
            .get("/v1/bddashboard/all-tasks")
            .set("x-test-user-id", user._id.toString())
            .query({ fromDeadline: "2025-09-11", toDeadline: "2025-09-20" });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(new Date(res.body.data[0].deadline)).toEqual(new Date("2025-09-15"));
    });

    test("should search tasks by title", async () => {
        const res = await request(app)
            .get("/v1/bddashboard/all-tasks")
            .set("x-test-user-id", user._id.toString())
            .query({ search: "Proposal" });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].title).toBe("Prepare Proposal");
    });

    test("should paginate results", async () => {
        const res = await request(app)
            .get("/v1/bddashboard/all-tasks")
            .set("x-test-user-id", user._id.toString())
            .query({ page: 1, limit: 1 });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.total).toBe(2);
        expect(res.body.page).toBe(1);
        expect(res.body.limit).toBe(1);
    });
});

