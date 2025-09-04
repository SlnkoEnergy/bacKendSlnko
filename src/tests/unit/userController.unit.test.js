// src/tests/unit/userController.unit.test.js
const request = require("supertest");
const app = require("../../index");
const userModells = require("../../Modells/users/userModells");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {authentication, authorization} = require("../../middlewares/auth")
// const userModells = require("../../Modells/users/userModells");

jest.mock("bcrypt");
jest.mock("jsonwebtoken");
jest.mock("../../middlewares/auth", async() => {
    authentication: (req, res, next) => {
        next();
    }
    authorization: (req, res, next) => {
        next();
    }
})

describe("UserRegister Testing with bcrypt (memory server)", () => {

    beforeAll(() => {
        process.env.PASSKEY = "testsecret"; // mock env secret
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test("should return 400 if required fields are missing", async () => {
        const res = await request(app)
            .post("/v1/user-registratioN-IT") // ensure this matches your router path
            .send({ name: "", emp_id: "", email: "", password: "" });

        expect(res.status).toBe(400);
        expect(res.body.msg).toMatch(/All fields are required/i);
    });

    test("should return 409 if user with same emp_id or email exists", async () => {
        // ✅ Seed existing user
        await userModells.create({
            name: "Existing",
            emp_id: "123",
            email: "test@test.com",
            password: "irrelevant",
        });

        const res = await request(app)
            .post("/v1/user-registratioN-IT")
            .send({ name: "Test", emp_id: "123", email: "test@test.com", password: "pass" });

        expect(res.status).toBe(409);
        expect(res.body.msg).toMatch(/already exists/i);
    });

    test("should hash password and save user if valid", async () => {
        bcrypt.genSalt.mockResolvedValue("salt");
        bcrypt.hash.mockResolvedValue("hashedPassword");

        const res = await request(app)
            .post("/v1/user-registratioN-IT")
            .send({ name: "Test", emp_id: "999", email: "ok@test.com", password: "pass" });

        expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
        expect(bcrypt.hash).toHaveBeenCalledWith("pass", "salt");
        expect(res.status).toBe(200);
        expect(res.body.msg).toBe("User registered successfully");

        // verify it actually saved to DB
        const saved = await userModells.findOne({ emp_id: "999" });
        expect(saved).toBeTruthy();
        expect(saved.email).toBe("ok@test.com");
        expect(saved.password).toBe("hashedPassword");
    });

    test("should return 500 if an error occurs", async () => {
        const spy = jest.spyOn(userModells, "findOne").mockRejectedValue(new Error("DB error"));

        const res = await request(app)
            .post("/v1/user-registratioN-IT")
            .send({ name: "Boom", emp_id: "111", email: "boom@test.com", password: "pass" });

        expect(res.status).toBe(500);
        expect(res.body.msg).toMatch(/Server error/i);

        spy.mockRestore();
    });
});

describe("Delete User Testing (memory server", () => {
    afterEach(() => {
        jest.clearAllMocks();
    })

    test("should return 404 if user not found", async() =>{
        const res = await request(app).delete('/v1/delete-useR-IT/1233456556545');
        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/user not found/i);
    });

    test("should return 200 and deleted user if user is found and deleted", async() => {
        const mockUser = { _id : '123', name: 'Test'};
        userModells.findByIdAndDelete(mockUser);

        const res = await request(app).delete('/v1/delete-useR-IT/123');
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/user delete successfully/i);
        expect(res.body.user).toEqual(mockUser);
    });
})
