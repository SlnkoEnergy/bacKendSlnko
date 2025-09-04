// const jest = require("jest");
const supertest = require("supertest");
const app = require("../../index");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const userModells = require("../../Modells/users/userModells");

jest.mock("bcrypt")
jest.mock("jsonwebtoken");
// jest.mock("../../middlewares/auth", () => {
//     return(res, req, next) => next();
// });

describe("UserRegister Testing with bcrypt", () => {
    beforeAll(() => {
        process.env.PASSKEY = "testscrete"
    }) 

    afterEach(() => {
        jest.clearAllMocks();
    });

    test("should return 400 if required fields are missing", async() => {
        const res = await supertest(app)
        .post("/v1/user-registratioN-IT")
        .send({name: '', emp_id : '', email: '', password : ''});

        expect(res.status).toBe(400);
        expect(res.body.msg).toMatch("All fields are required");
    });
});