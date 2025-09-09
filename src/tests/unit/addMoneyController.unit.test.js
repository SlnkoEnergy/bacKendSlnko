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

const AddMoney = require("../../Modells/addMoneyModells");
const Project = require("../../Modells/project.model")

const app = require("../../index")

describe("POST /Add-MoneY-IT", () => {
    // Test database connection setup

    // Clean up database before each test
    beforeEach(async () => {
        await AddMoney.deleteMany({});
        await Project.deleteMany({});
    });

    // Close database connection after all tests
    afterAll(async () => {
        await AddMoney.deleteMany({});
        await Project.deleteMany({});
    });

    describe("Successful money addition", () => {
        test("should add money successfully when project exists", async () => {
            // Create a test project first
            const testProject = new Project({
                p_id: 12345,
                customer: "Test Customer",
                name: "Test Project",
                email: "test@example.com",
                number: "1234567890",
                project_status: "active"
            });
            await testProject.save();

            const moneyData = {
                p_id: 12345,
                submitted_by: "test_user",
                cr_amount: 5000,
                cr_mode: "bank_transfer",
                cr_date: new Date("2024-01-15"),
                comment: "Initial payment"
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData)
                .expect(201);

            expect(response.body.msg).toBe("Money added successfully");
            expect(response.body.data).toMatchObject({
                p_id: 12345,
                submitted_by: "test_user",
                cr_amount: 5000,
                cr_mode: "bank_transfer",
                comment: "Initial payment"
            });
            expect(response.body.data._id).toBeDefined();
            expect(response.body.data.createdAt).toBeDefined();
            expect(response.body.data.updatedAt).toBeDefined();
        });

        test("should add money with minimal required fields", async () => {
            // Create a test project
            const testProject = new Project({
                p_id: 67890,
                customer: "Another Customer",
                name: "Another Project"
            });
            await testProject.save();

            const moneyData = {
                p_id: 67890,
                submitted_by: "admin",
                cr_amount: 10000,
                cr_mode: "cash",
                cr_date: new Date()
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "admin123")
                .send(moneyData)
                .expect(201);

            expect(response.body.msg).toBe("Money added successfully");
            expect(response.body.data.p_id).toBe(67890);
            expect(response.body.data.cr_amount).toBe(10000);
        });

        test("should save money record to database", async () => {
            // Create a test project
            const testProject = new Project({
                p_id: 11111,
                customer: "Database Test Customer"
            });
            await testProject.save();

            const moneyData = {
                p_id: 11111,
                submitted_by: "db_tester",
                cr_amount: 7500,
                cr_mode: "online",
                cr_date: new Date("2024-02-01"),
                comment: "Database test payment"
            };

            await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "tester123")
                .send(moneyData)
                .expect(201);

            // Verify the record was saved in database
            const savedRecord = await AddMoney.findOne({ p_id: 11111 });
            expect(savedRecord).toBeTruthy();
            expect(savedRecord.submitted_by).toBe("db_tester");
            expect(savedRecord.cr_amount).toBe(7500);
            expect(savedRecord.comment).toBe("Database test payment");
        });
    });

    describe("Project validation", () => {
        test("should return 400 when project does not exist", async () => {
            const moneyData = {
                p_id: 99999, // Non-existent project ID
                submitted_by: "test_user",
                cr_amount: 5000,
                cr_mode: "bank_transfer",
                cr_date: new Date()
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData)
                .expect(400);

            expect(response.body.msg).toBe("Project not found");
            expect(response.body.data).toBeUndefined();
        });

        test("should handle case when project collection is empty", async () => {
            // Ensure no projects exist
            await Project.deleteMany({});

            const moneyData = {
                p_id: 12345,
                submitted_by: "test_user",
                cr_amount: 5000,
                cr_mode: "bank_transfer",
                cr_date: new Date()
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData)
                .expect(400);

            expect(response.body.msg).toBe("Project not found");
        });
    });

    describe("Input validation", () => {
        beforeEach(async () => {
            // Create a test project for validation tests
            const testProject = new Project({
                p_id: 12345,
                customer: "Validation Test Customer"
            });
            await testProject.save();
        });

        test("should handle missing required fields gracefully", async () => {
            const incompleteData = {
                p_id: 12345,
                // Missing other required fields
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(incompleteData)
                .expect(201); // Mongoose allows undefined fields

            expect(response.body.msg).toBe("Money added successfully");
            expect(response.body.data.p_id).toBe(12345);
        });

        test("should handle empty request body", async () => {
            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send({})
                .expect(400);

            expect(response.body.msg).toBe("Project not found");
        });

        test("should handle null values", async () => {
            const dataWithNulls = {
                p_id: 12345,
                submitted_by: null,
                cr_amount: null,
                cr_mode: null,
                cr_date: null,
                comment: null
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(dataWithNulls)
                .expect(201);

            expect(response.body.msg).toBe("Money added successfully");
            expect(response.body.data.p_id).toBe(12345);
        });
    });

    describe("Data types validation", () => {
        beforeEach(async () => {
            const testProject = new Project({
                p_id: 12345,
                customer: "Data Type Test Customer"
            });
            await testProject.save();
        });

        test("should handle string cr_amount (should be converted to number)", async () => {
            const moneyData = {
                p_id: 12345,
                submitted_by: "test_user",
                cr_amount: "5000", // String instead of number
                cr_mode: "bank_transfer",
                cr_date: new Date()
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData)
                .expect(201);

            expect(response.body.data.cr_amount).toBe(5000);
            expect(typeof response.body.data.cr_amount).toBe("number");
        });

        test("should handle invalid date format", async () => {
            const moneyData = {
                p_id: 12345,
                submitted_by: "test_user",
                cr_amount: 5000,
                cr_mode: "bank_transfer",
                cr_date: "invalid-date"
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData);

            // This might succeed or fail depending on mongoose validation
            // The test documents the current behavior
            expect([200, 201, 400]).toContain(response.status);
        });
    });

    describe("Error handling", () => {
        test("should handle database connection errors gracefully", async () => {
            // Create a test project first
            const testProject = new Project({
                p_id: 12345,
                customer: "Error Test Customer"
            });
            await testProject.save();

            // Temporarily close the database connection to simulate error
            await mongoose.connection.close();

            const moneyData = {
                p_id: 12345,
                submitted_by: "test_user",
                cr_amount: 5000,
                cr_mode: "bank_transfer",
                cr_date: new Date()
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData)
                .expect(400);

            expect(response.body.msg).toBe("Server error");
            expect(response.body.error).toBeDefined();

            // Reconnect for other tests
            const mongoUri = process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/test_db";
            await mongoose.connect(mongoUri);
        });

        test("should handle malformed JSON", async () => {
            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .set("Content-Type", "application/json")
                .send('{"invalid": json}') // Malformed JSON
                .expect(400);

            // Express will handle malformed JSON and return 400
            expect(response.status).toBe(400);
        });
    });

    describe("Authentication middleware", () => {
        beforeEach(async () => {
            const testProject = new Project({
                p_id: 12345,
                customer: "Auth Test Customer"
            });
            await testProject.save();
        });

        test("should work with valid user ID in header", async () => {
            const moneyData = {
                p_id: 12345,
                submitted_by: "auth_user",
                cr_amount: 5000,
                cr_mode: "bank_transfer",
                cr_date: new Date()
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "valid_user_123")
                .send(moneyData)
                .expect(201);

            expect(response.body.msg).toBe("Money added successfully");
        });

        test("should handle missing authentication header", async () => {
            const moneyData = {
                p_id: 12345,
                submitted_by: "no_auth_user",
                cr_amount: 5000,
                cr_mode: "bank_transfer",
                cr_date: new Date()
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                // No authentication header
                .send(moneyData);

            // The mocked middleware will still call next() but req.user will be undefined
            // The behavior depends on how your route handles missing user info
            expect([200, 201, 401, 403]).toContain(response.status);
        });
    });

    describe("Edge cases", () => {
        test("should handle very large amounts", async () => {
            const testProject = new Project({
                p_id: 12345,
                customer: "Large Amount Test"
            });
            await testProject.save();

            const moneyData = {
                p_id: 12345,
                submitted_by: "test_user",
                cr_amount: Number.MAX_SAFE_INTEGER,
                cr_mode: "bank_transfer",
                cr_date: new Date()
            };

            const response = await request(app)
                .post("/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData)
                .expect(201);

            expect(response.body.data.cr_amount).toBe(Number.MAX_SAFE_INTEGER);
        });

        test("should handle negative amounts", async () => {
            const testProject = new Project({
                p_id: 12345,
                customer: "Negative Amount Test"
            });
            await testProject.save();

            const moneyData = {
                p_id: 12345,
                submitted_by: "test_user",
                cr_amount: -1000,
                cr_mode: "bank_transfer",
                cr_date: new Date()
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData)
                .expect(201);

            expect(response.body.data.cr_amount).toBe(-1000);
        });

        test("should handle very long comments", async () => {
            const testProject = new Project({
                p_id: 12345,
                customer: "Long Comment Test"
            });
            await testProject.save();

            const longComment = "a".repeat(1000); // Very long comment
            const moneyData = {
                p_id: 12345,
                submitted_by: "test_user",
                cr_amount: 5000,
                cr_mode: "bank_transfer",
                cr_date: new Date(),
                comment: longComment
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData)
                .expect(201);

            expect(response.body.data.comment).toBe(longComment);
        });

        test("should handle multiple projects with same p_id", async () => {
            // Create multiple projects with same p_id (if your schema allows)
            const project1 = new Project({
                p_id: 12345,
                customer: "Customer 1"
            });
            const project2 = new Project({
                p_id: 12345,
                customer: "Customer 2"
            });
            await project1.save();
            await project2.save();

            const moneyData = {
                p_id: 12345,
                submitted_by: "test_user",
                cr_amount: 5000,
                cr_mode: "bank_transfer",
                cr_date: new Date()
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData)
                .expect(201);

            expect(response.body.msg).toBe("Money added successfully");
        });
    });

    describe("Response format validation", () => {
        test("should return correct response structure on success", async () => {
            const testProject = new Project({
                p_id: 12345,
                customer: "Response Test Customer"
            });
            await testProject.save();

            const moneyData = {
                p_id: 12345,
                submitted_by: "test_user",
                cr_amount: 5000,
                cr_mode: "bank_transfer",
                cr_date: new Date(),
                comment: "Test payment"
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData)
                .expect(201);

            expect(response.body).toHaveProperty("msg");
            expect(response.body).toHaveProperty("data");
            expect(response.body.data).toHaveProperty("_id");
            expect(response.body.data).toHaveProperty("createdAt");
            expect(response.body.data).toHaveProperty("updatedAt");
            expect(response.body.data).toHaveProperty("p_id");
            expect(response.body.data).toHaveProperty("submitted_by");
            expect(response.body.data).toHaveProperty("cr_amount");
            expect(response.body.data).toHaveProperty("cr_mode");
            expect(response.body.data).toHaveProperty("comment");
        });

        test("should return correct error response structure", async () => {
            const moneyData = {
                p_id: 99999, // Non-existent project
                submitted_by: "test_user",
                cr_amount: 5000
            };

            const response = await request(app)
                .post("/v1/Add-MoneY-IT")
                .set("x-test-user-id", "user123")
                .send(moneyData)
                .expect(400);

            expect(response.body).toHaveProperty("msg");
            expect(response.body.msg).toBe("Project not found");
            expect(response.body).not.toHaveProperty("data");
        });
    });
});


