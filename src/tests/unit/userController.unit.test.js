const jest = require("jest");
const supertest = require("supertest");
const app = require("../../index");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const userModells = require("../../Modells/users/userModells");

jest.mock("bcrypt")
jest.mock("jsonwebtoken");
jest.mock("../../middlewares/auth", () => {
    return(res, req, next) => next();
});