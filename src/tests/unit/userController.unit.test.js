// src/tests/unit/userController.unit.test.js

jest.mock("bcrypt");
jest.mock("jsonwebtoken");

// Mock auth so routes with auth succeed, and let us inject a user via header
jest.mock("../../middlewares/auth", () => ({
  authentication: (req, res, next) => {
    const id = req.headers["x-test-user-id"];
    if (id) req.user = { userId: id };
    next();
  },
  authorization: (req, res, next) => next(),
}));

// Nodemailer mock with a helper handle for sendMail
jest.mock("nodemailer", () => {
  const mockSendMail = jest.fn();
  return {
    __esModule: true,
    createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
    _mock: { mockSendMail },
  };
});

// Stable device + IP for session/BD flows
jest.mock("../../utils/generateSystemIdentifier", () =>
  jest.fn(async () => ({
    device_id: "TEST_DEVICE_001",
    ip: "203.0.113.10",
  }))
);

const request = require("supertest");
const app = require("../../index");
const userModells = require("../../Modells/users/userModells");
const session = require("../../Modells/users/session");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { default: mongoose } = require("mongoose");
const nodemailer = require("nodemailer");
const { mockSendMail } = nodemailer._mock;

let errSpy;
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.PASSKEY = "testsecret";

  // Email envs so transporter creation doesn't fail
  process.env.EMAIL_HOST = "smtp.example.com";
  process.env.EMAIL_PORT = "587";
  process.env.EMAIL_SECURE = "false";
  process.env.EMAIL_SERVICE = "";
  process.env.EMAIL_USER = "no-reply@slnkoenergy.com";
  process.env.EMAIL_PASS = "secret";
  process.env.EMAIL_ADMIN = "admin@example.com";

  // Global defaults
  bcrypt.compare.mockResolvedValue(true);
  jwt.sign.mockReturnValue("jwt.token.value");

  // sendMail: support both promise and callback signatures
  mockSendMail.mockImplementation((arg1, arg2) => {
    if (typeof arg2 === "function") {
      setImmediate(() =>
        arg2(null, { accepted: [arg1?.to || process.env.EMAIL_ADMIN] })
      );
      return;
    }
    return Promise.resolve({ messageId: "mocked" });
  });

  // Quiet expected console.error noise from tests that intentionally trigger errors
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  errSpy?.mockRestore();
});

describe("UserRegister Testing with bcrypt (memory server)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should return 400 if required fields are missing", async () => {
    const res = await request(app)
      .post("/v1/user-registratioN-IT")
      .send({ name: "", emp_id: "", email: "", password: "" });

    expect(res.status).toBe(400);
    expect(res.body.msg).toMatch(/All fields are required/i);
  });

  test("should return 409 if user with same emp_id or email exists", async () => {
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
  });

  test("should return 404 if user not found", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).delete(`/v1/delete-useR-IT/${missingId}`);
    expect(res.status).toBe(404);
    expect((res.body.msg || res.body.message)).toMatch(/user not found/i);
  });

  test("should return 200 and deleted user if user is found and deleted", async () => {
    const newUser = await userModells.create({
      name: "Existing",
      emp_id: "123",
      email: "test@test.com",
      password: "irrelevant",
    });

    const res = await request(app).delete(`/v1/delete-useR-IT/${newUser._id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/user deleted successfully/i);
  });

  test("should return 500 if an error occurs during deletion", async () => {
    userModells.findByIdAndDelete(new Error("DB error"));
    const res = await request(app).delete("/v1/delete-useR-IT/123");
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Error deleting user/i);
  });
});

describe("Forget Password Testing", () => {
  test("should return 400 if email is missing", async () => {
    const res = await request(app).post("/v1/sendOtp").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email is required/i);
  });

  test("should return 404 if user not found", async () => {
    const res = await request(app).post("/v1/sendOtp").send({ email: "usernotfound@gmail.com" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/user not found/i);
  });

  test("should set OTP, save user, and send email if user exists", async () => {
    nodemailer.createTransport.mockClear?.();
    mockSendMail.mockClear?.();

    await userModells.create({
      name: "Test",
      emp_id: "1233",
      email: "test@test.com",
      password: "pass",
    });

    const res = await request(app).post("/v1/sendOtp").send({ email: "test@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/otp sent successfully/i);
    expect(res.body.email).toBe("test@test.com");

    const updatedUser = await userModells
      .findOne({ email: "test@test.com" })
      .select("+otp +otpExpires")
      .lean();

    expect(updatedUser).toBeTruthy();
    expect(updatedUser.otp).toBeDefined();

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalled();

    const firstCallArgs = mockSendMail.mock.calls[0][0];
    if (firstCallArgs && typeof firstCallArgs === "object") {
      expect(firstCallArgs.to).toBe("test@test.com");
    }
  });

  test("should return 500 if an error occurs", async () => {
    await userModells.create({
      name: "Test",
      emp_id: "1",
      email: "test@gmail.com",
      password: "pass",
    });

    mockSendMail.mockRejectedValueOnce(new Error("SMTP send error"));

    const res = await request(app).post("/v1/sendOtp").send({ email: "test@gmail.com" });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/an error occurred/i);
  });
});

describe("Verify Otp Testing", () => {
  test("should return 404 if user not found", async () => {
    const res = await request(app)
      .post("/v1/verifyOtp")
      .send({ email: "nouser@example.com", otp: "123456" });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/user not found/i);
  });

  test("should return 400 if OTP is invalid", async () => {
    await userModells.create({
      name: "Bob",
      emp_id: "E2",
      email: "bob@example.com",
      password: "x",
      otp: 654321,
      otpExpires: Date.now() + 10 * 60 * 1000,
    });

    const res = await request(app)
      .post("/v1/verifyOtp")
      .send({ email: "bob@example.com", otp: "111111" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid otp/i);
  });

   // test("should return 400 if OTP is missing", async () => {
    //     // seed user so we pass the user check and hit the 'OTP required' branch
    //     await userModells.create({
    //         name: "Alice",
    //         emp_id: "E1",
    //         email: "alice@example.com",
    //         password: "x",
    //     });

    //     const res = await request(app)
    //         .post("/v1/verifyOtp")
    //         .send({ email: "alice@example.com" }); // no otp

    //     expect(res.status).toBe(400);
    //     // your controller message is "OTP are required." — use a flexible regex:
    //     expect(res.body.message).toMatch(/otp.*required/i);
    // });

     // test("should return 400 if OTP has expired", async () => {
    //     // 1) Seed a user
    //     await userModells.create({
    //         name: "Carol",
    //         emp_id: "E3",
    //         email: "carol@example.com",
    //         password: "x",
    //     });

    //     // 2) Generate OTP via your actual flow so all fields are set consistently
    //     await request(app).post("/v1/sendOtp").send({ email: "carol@example.com" });

    //     // 3) Reload user to get the generated OTP, then make it expired
    //     const user = await userModells.findOne({ email: "carol@example.com" });
    //     expect(user).toBeTruthy();
    //     const otpValue = user.otp; // whatever your sendOtp generated

    //     // Backdate the expiry by 1 minute
    //     user.otpExpires = Date.now() - 60 * 1000; // if your schema is Number
    //     // If your schema is Date instead, use: user.otpExpires = new Date(Date.now() - 60 * 1000);
    //     await user.save();

    //     // 4) Try to verify with a now-expired OTP
    //     const res = await request(app)
    //         .post("/v1/verifyOtp")
    //         .send({ email: "carol@example.com", otp: String(otpValue) });

    //     expect(res.status).toBe(400);
    //     expect(res.body.message).toMatch(/otp has expired/i);
    // });

  test("should return 200 if OTP is valid and not expired", async () => {
    await userModells.create({
      name: "Dave",
      emp_id: "E4",
      email: "dave@example.com",
      password: "x",
      otp: 987654,
      otpExpires: Date.now() + 10 * 60 * 1000,
    });

    const res = await request(app)
      .post("/v1/verifyOtp")
      .send({ email: "dave@example.com", otp: "987654" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/otp verified successfully/i);
  });

  test("should return 500 if an unexpected error occurs (findOne rejects)", async () => {
    const spy = jest.spyOn(userModells, "findOne").mockRejectedValue(new Error("DB boom"));

    const res = await request(app)
      .post("/v1/verifyOtp")
      .send({ email: "err@example.com", otp: "123456" });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/internal server error/i);

    spy.mockRestore();
  });
});

describe("Verify and Reset Password Testing", () => {
  test("should return 400 if any required field is missing", async () => {
    let res = await request(app).post("/v1/resetPassword").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email, new password, and confirm password are required/i);

    res = await request(app).post("/v1/resetPassword").send({ email: "a@b.com", newPassword: "New@123" });
    expect(res.status).toBe(400);

    res = await request(app).post("/v1/resetPassword").send({ email: "a@b.com", confirmPassword: "New@123" });
    expect(res.status).toBe(400);

    res = await request(app).post("/v1/resetPassword").send({ newPassword: "New@123", confirmPassword: "New@123" });
    expect(res.status).toBe(400);
  });

  test("should return 400 if newPassword and confirmPassword do not match", async () => {
    const res = await request(app).post("/v1/resetPassword").send({
      email: "mismatch@example.com",
      newPassword: "New@123",
      confirmPassword: "New@124",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/do not match/i);
  });

  test("should return 404 if user not found", async () => {
    const res = await request(app).post("/v1/resetPassword").send({
      email: "nouser@example.com",
      newPassword: "New@123",
      confirmPassword: "New@123",
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/user not found/i);
  });

  test("should hash the new password, clear OTP fields, and return 200 on success", async () => {
    await userModells.create({
      name: "Alice",
      emp_id: "E10",
      email: "alice@example.com",
      password: "old-hash",
      otp: 123456,
      otpExpires: Date.now() + 5 * 60 * 1000,
    });

    bcrypt.hash.mockResolvedValue("hashed-new-password");

    const res = await request(app).post("/v1/resetPassword").send({
      email: "alice@example.com",
      newPassword: "New@123",
      confirmPassword: "New@123",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password has been reset successfully/i);
    expect(bcrypt.hash).toHaveBeenCalledWith("New@123", 10);

    const updated = await userModells.findOne({ email: "alice@example.com" }).lean();
    expect(updated).toBeTruthy();
    expect(updated.password).toBe("hashed-new-password");
    expect(updated.otp).toBeNull();
    expect(updated.otpExpires == null).toBe(true);
  });

  test("should return 500 if an unexpected error occurs (findOne rejects)", async () => {
    const spy = jest.spyOn(userModells, "findOne").mockRejectedValue(new Error("DB down"));

    const res = await request(app).post("/v1/resetPassword").send({
      email: "err@example.com",
      newPassword: "New@123",
      confirmPassword: "New@123",
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/internal server error/i);

    spy.mockRestore();
  });

  test("should return 500 if saving the user fails", async () => {
    const user = await userModells.create({
      name: "Bob",
      emp_id: "E11",
      email: "bob@example.com",
      password: "old-hash",
      otp: 654321,
      otpExpires: Date.now() + 5 * 60 * 1000,
    });

    const doc = await userModells.findOne({ _id: user._id });
    const saveSpy = jest.spyOn(doc, "save").mockRejectedValue(new Error("Save failed"));
    const findSpy = jest.spyOn(userModells, "findOne").mockResolvedValue(doc);
    bcrypt.hash.mockResolvedValue("hashed-new-password");

    const res = await request(app).post("/v1/resetPassword").send({
      email: "bob@example.com",
      newPassword: "New@123",
      confirmPassword: "New@123",
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/internal server error/i);

    saveSpy.mockRestore();
    findSpy.mockRestore();
  });
});

describe("Login Testing", () => {
  beforeEach(async () => {
    if (session?.deleteMany) await session.deleteMany({});
    nodemailer.createTransport.mockClear();
    mockSendMail.mockClear();
  });

  test("400 when password missing", async () => {
    const res = await request(app).post("/v1/logiN-IT").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(res.body.msg).toMatch(/password is required/i);
  });

  test("400 when identity missing", async () => {
    const res = await request(app).post("/v1/logiN-IT").send({ password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.msg).toMatch(/enter any of username, emp_id, or email/i);
  });

  test("401 when user not found", async () => {
    const res = await request(app).post("/v1/logiN-IT").send({ email: "nouser@example.com", password: "x" });
    expect(res.status).toBe(401);
    expect(res.body.msg).toMatch(/invalid credentials/i);
  });

  test("401 when password mismatch", async () => {
    await userModells.create({
      name: "U",
      emp_id: "E1",
      email: "u@example.com",
      password: "hashed",
    });
    bcrypt.compare.mockResolvedValueOnce(false);

    const res = await request(app).post("/v1/logiN-IT").send({ email: "u@example.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.msg).toMatch(/invalid credentials/i);
  });

  test("200 for non-BD user (no device/session flow), returns token", async () => {
    const u = await userModells.create({
      name: "Normal",
      emp_id: "N1",
      email: "normal@example.com",
      password: "hash",
      department: "Accounts",
    });

    const res = await request(app).post("/v1/logiN-IT").send({ email: "normal@example.com", password: "ok" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBe("jwt.token.value");
    expect(res.body.userId).toBe(u._id.toString());
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test("403 for BD user with unrecognized device: sets OTP, emails admin, no session created", async () => {
    await userModells.create({
      name: "BD User",
      emp_id: "BD1",
      email: "bd@example.com",
      password: "hash",
      department: "BD",
    });

    const res = await request(app)
      .post("/v1/logiN-IT")
      .send({
        email: "bd@example.com",
        password: "ok",
        latitude: 12.3,
        longitude: 77.5,
        fullAddress: "Somewhere",
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/unrecognized device/i);
    expect(res.body.email).toBe("bd@example.com");
    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalled();
  });

  test("200 for BD user with recognized device: creates session and returns token", async () => {
    const u = await userModells.create({
      name: "BD Known",
      emp_id: "BD2",
      email: "bd-known@example.com",
      password: "hash",
      department: "BD",
    });

    if (session?.create) {
      await session.create({
        user_id: u._id,
        device_info: { device_id: "TEST_DEVICE_001", ip: "203.0.113.10" },
        login_time: new Date(),
      });
    }

    const res = await request(app)
      .post("/v1/logiN-IT")
      .send({
        email: "bd-known@example.com",
        password: "ok",
        latitude: 12.3,
        longitude: 77.5,
        fullAddress: "Somewhere",
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe("jwt.token.value");
    expect(res.body.userId).toBe(u._id.toString());

    if (session?.countDocuments) {
      const count = await session.countDocuments({ user_id: u._id });
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("Finalize BD Login", () => {
  test("404 when user not found", async () => {
    const res = await request(app)
      .post("/v1/session-verify")
      .send({ email: "nouser@example.com", latitude: 1, longitude: 2, fullAddress: "X" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/user not found/i);
  });

  test("200 creates session and returns token for existing user", async () => {
    const u = await userModells.create({
      name: "BD Final",
      emp_id: "BD3",
      email: "bd-final@example.com",
      password: "hash",
      department: "BD",
    });

    const res = await request(app)
      .post("/v1/session-verify")
      .send({ email: "bd-final@example.com", latitude: 11, longitude: 22, fullAddress: "Addr" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe("jwt.token.value");
    expect(res.body.userId).toBe(u._id.toString());

    if (session?.findOne) {
      const rec = await session.findOne({ user_id: u._id });
      expect(rec).toBeTruthy();
      expect(rec.device_info.device_id).toBe("TEST_DEVICE_001");
    }
  });
});

describe("Logout Testing", () => {
  test("404 or 500 when user missing / not found", async () => {
    const res = await request(app).put("/v1/logout").send();
    expect([404, 500]).toContain(res.status);
  });

  test("404 when no active session found for BD user", async () => {
    const u = await userModells.create({
      name: "BD NoSession",
      emp_id: "BD4",
      email: "bd-nosession@example.com",
      password: "hash",
      department: "BD",
    });

    const res = await request(app).put("/v1/logout").set("x-test-user-id", u._id.toString()).send();

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no active session found/i);
  });

  test("200 closes the active session for BD user", async () => {
    const u = await userModells.create({
      name: "BD HasSession",
      emp_id: "BD5",
      email: "bd-has@example.com",
      password: "hash",
      department: "BD",
    });

    let s;
    if (session?.create) {
      s = await session.create({
        user_id: u._id,
        device_info: { device_id: "TEST_DEVICE_001", ip: "203.0.113.10" },
        login_time: new Date(),
      });
    }

    const res = await request(app).put("/v1/logout").set("x-test-user-id", u._id.toString()).send();

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out successfully/i);

    if (session?.findById) {
      const updated = await session.findById(s._id);
      expect(updated.logout_time).toBeTruthy();
    }
  });

  test("200 for non-BD user (no session manipulation)", async () => {
    const u = await userModells.create({
      name: "Accounts User",
      emp_id: "A1",
      email: "acc@example.com",
      password: "hash",
      department: "Accounts",
    });

    const res = await request(app).put("/v1/logout").set("x-test-user-id", u._id.toString()).send();

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out successfully/i);
  });
});

describe("Get all users", () => {
  test("returns 200 with array", async () => {
    await userModells.insertMany([
      { name: "U1", emp_id: "E1", email: "u1@example.com", password: "x", department: "BD" },
      { name: "U2", emp_id: "E2", email: "u2@example.com", password: "x", department: "Accounts" },
    ]);

    const res = await request(app).get("/v1/get-all-useR-IT").send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Get single user", () => {
  test("GET /v1/get-single-user/:_id returns 404 if not found", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/v1/get-single-useR-IT/${id}`).send();
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/user not found/i);
  });

  test("GET /v1/get-single-user/:_id returns 200 with selected fields", async () => {
    const doc = await userModells.create({
      name: "Solo",
      emp_id: "S1",
      email: "solo@example.com",
      password: "secret",
      phone: "999",
      department: "BD",
      role: "member",
      otp: 111111,
      otpExpires: Date.now() + 60000,
    });

    const res = await request(app).get(`/v1/get-single-useR-IT/${doc._id}`).send();
    expect(res.status).toBe(200);
    const user = res.body.user;
    expect(user).toBeTruthy();
    expect(user.password).toBeUndefined();
    expect(user.otp).toBeUndefined();
    expect(user.otpExpires).toBeUndefined();
    expect(user._id).toBeUndefined();
    expect(user.email).toBeUndefined();
    expect(user.phone).toBeUndefined();
  });
});

describe("Get users by department", () => {
  test("GET filters to BD", async () => {
    await userModells.insertMany([
      { name: "BD1", emp_id: "B1", email: "b1@x.com", password: "x", department: "BD" },
      { name: "BD2", emp_id: "B2", email: "b2@x.com", password: "x", department: "BD" },
      { name: "ACC1", emp_id: "A1", email: "a1@x.com", password: "x", department: "Accounts" },
    ]);

    // Ensure no duplicate emp_id
    await userModells.create({
      name: "Accounts User",
      emp_id: "A45",
      email: "acc@example.com",
      password: "hash",
      department: "Accounts",
    });

    const res = await request(app)
      .get("/v1/all-user")
      .query({ department: "BD" })
      .send();

    expect(res.status).toBe(200);
    const arr = res.body.data || [];
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.map((x) => x.name).sort()).toEqual(["BD1", "BD2"]);
  });
});

describe("Edit user", () => {
  test("PUT 404 when not found", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const res = await request(app).put(`/v1/edit-user/${id}`).send({ name: "X" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/user not found/i);
  });

  test("PUT 200 updates fields", async () => {
    const doc = await userModells.create({
      name: "Old",
      emp_id: "E0",
      email: "old@x.com",
      phone: "111",
      department: "BD",
      role: "member",
      password: "x",
    });

    const res = await request(app)
      .put(`/v1/edit-user/${doc._id}`)
      .send({
        name: "Updated",
        emp_id: "E999",
        email: "updated@x.com",
        phone: "222",
        department: "Accounts",
        role: "admin",
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated successfully/i);
    expect(res.body.user.name).toBe("Updated");
    expect(res.body.user.department).toBe("Accounts");
  });
});

describe("Get all departments", () => {
  test("GET returns distinct list", async () => {
    await userModells.insertMany([
      { name: "U1", emp_id: "X1", email: "x1@x.com", password: "x", department: "BD" },
      { name: "U2", emp_id: "X2", email: "x2@x.com", password: "x", department: "Accounts" },
      { name: "U3", emp_id: "X3", email: "x3@x.com", password: "x", department: "BD" },
    ]);

    const res = await request(app).get("/v1/all-dept").send();
    expect(res.status).toBe(200);
    const arr = res.body.data || [];
    expect(Array.isArray(arr)).toBe(true);
    expect(new Set(arr).size).toBe(arr.length);
    expect(arr).toEqual(expect.arrayContaining(["BD", "Accounts"]));
  });
});
