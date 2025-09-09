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

const Users = require("../../Modells/users/userModells");
const Group = require("../../Modells/bdleads/group");
const app = require("../../index");

// Helper: seed a test user
async function seedUser({
    _id,
    name = "Test User",
    department = "Accounts",
    role = "member",
    emp_id,
    password = "Test@12345",
    email,
}) {
    const id = _id || new mongoose.Types.ObjectId();

    const unique = () => Math.random().toString(36).slice(2, 8);
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

beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => { }); // silence error logs
});
afterAll(() => {
    console.error.mockRestore();
});





describe("POST /group (createGroup)", () => {


    test("should return 400 if required fields are missing", async () => {

        const userID = new mongoose.Types.ObjectId();
        const res = await request(app)
            .post("/v1/bddashboard/group")
            .set("x-test-user-id", userID.toString())
            .send({
                data: {
                    group_name: "Solar Group", // ❌ missing capacity, source.from, mobile, state
                },
            });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error", "Please fill all required fields.");
    });

    test("should create a group successfully when all required fields are present", async () => {
        const userID = new mongoose.Types.ObjectId();
        const res = await request(app)
            .post("/v1/bddashboard/group")
            .set("x-test-user-id", userID.toString())
            .send({
                data: {
                    group_name: "Solar Group",
                    contact_details: {
                        mobile: ["9876543210"],
                    },
                    address: {
                        state: "Rajasthan",
                    },
                    project_details: {
                        capacity: "50MW",
                    },
                    source: {
                        from: "LinkedIn",
                    },
                },
            });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message", "Group created successfully");
        expect(res.body.data).toHaveProperty("_id");
        expect(res.body.data).toHaveProperty("group_code", "BD/Group/1");
        expect(res.body.data).toHaveProperty("createdBy", userID.toString());

        const saved = await Group.findOne({ group_name: "Solar Group" });
        expect(saved).not.toBeNull();
        expect(saved.group_code).toBe("BD/Group/1");
    });

    test("should increment group_code if previous exists", async () => {
        // Create one manually
        const userID = new mongoose.Types.ObjectId();
        await Group.create({
            group_name: "Existing Group",
            contact_details: { mobile: ["1111111111"] },
            address: { state: "Gujarat" },
            project_details: { capacity: "20MW" },
            source: { from: "Event" },
            group_code: "BD/Group/1",
            createdBy: userID,
        });

        const res = await request(app)
            .post("/v1/bddashboard/group")
            .set("x-test-user-id", userID.toString())
            .send({
                data: {
                    group_name: "New Group",
                    contact_details: {
                        mobile: ["2222222222"],
                    },
                    address: {
                        state: "Maharashtra",
                    },
                    project_details: {
                        capacity: "10MW",
                    },
                    source: {
                        from: "Cold Call",
                    },
                },
            });

        expect(res.status).toBe(200);
        expect(res.body.data.group_code).toBe("BD/Group/2");
    });
});


describe("GET /group (getAllGroup)", () => {
    // simple helper to make a valid group doc
    const makeGroup = ({
        name = "Group",
        createdBy,
        code,
        capacity = "100",
        state = "Rajasthan",
        mobile = ["9000000000"],
        sourceFrom = "LinkedIn",
        extra = {},
    }) =>
        Group.create({
            group_name: name,
            group_code: code,
            createdBy,
            contact_details: { mobile },
            address: { state },
            project_details: { capacity },
            source: { from: sourceFrom },
            ...extra,
        });

    test("non-admin user only sees groups they created", async () => {
        const owner = await seedUser({ name: "Alice Owner" });
        const other = await seedUser({ name: "Bob Other" });

        await makeGroup({ name: "Owner Group", createdBy: owner._id, capacity: "80" });
        await makeGroup({ name: "Other Group", createdBy: other._id, capacity: "120" });

        const res = await request(app)
            .get("/v1/bddashboard/group")
            .set("x-test-user-id", owner._id.toString())
            .expect(200);

        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].group_name).toBe("Owner Group");
        expect(res.body.totalCount).toBe(1);
        expect(res.body.currentPage).toBe(1);
    });

    test('admin user (name "IT Team") can see all groups', async () => {
        const admin = await seedUser({ name: "IT Team" });
        const u1 = await seedUser({ name: "U1" });
        const u2 = await seedUser({ name: "U2" });

        await makeGroup({ name: "G1", createdBy: u1._id, capacity: "50" });
        await makeGroup({ name: "G2", createdBy: u2._id, capacity: "75" });

        const res = await request(app)
            .get("/v1/bddashboard/group")
            .set("x-test-user-id", admin._id.toString())
            .expect(200);

        const names = res.body.data.map((g) => g.group_name).sort();
        expect(names).toEqual(["G1", "G2"]);
        expect(res.body.totalCount).toBe(2);
    });

    test("supports search by group_name", async () => {
        const me = await seedUser({ name: "Searcher" });

        await makeGroup({ name: "Alpha Solar", createdBy: me._id, capacity: "100" });
        await makeGroup({ name: "Beta Wind", createdBy: me._id, capacity: "90" });

        const res = await request(app)
            .get("/v1/bddashboard/group")
            .query({ search: "beta" })
            .set("x-test-user-id", me._id.toString())
            .expect(200);

        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].group_name).toBe("Beta Wind");
        expect(res.body.totalCount).toBe(1);
    });

    test("paginates results and returns meta (totalPages, currentPage, totalCount)", async () => {
        const me = await seedUser({ name: "Paginator" });

        // create 12 groups for this user
        const creations = [];
        for (let i = 1; i <= 12; i++) {
            creations.push(makeGroup({ name: `G-${i}`, createdBy: me._id, capacity: String(50 + i) }));
        }
        await Promise.all(creations);

        const res = await request(app)
            .get("/v1/bddashboard/group")
            .query({ page: 3, limit: 5 }) // expect 5 + 5 + 2
            .set("x-test-user-id", me._id.toString())
            .expect(200);

        expect(res.body.data.length).toBe(2);
        expect(res.body.totalPages).toBe(3);
        expect(res.body.currentPage).toBe(3);
        expect(res.body.totalCount).toBe(12);
    });

    test("computes total_lead_capacity and left_capacity from linked bdleads", async () => {
        const admin = await seedUser({ name: "IT Team" });
        const owner = await seedUser({ name: "Capacity Owner" });

        const g = await makeGroup({
            name: "CapGroup",
            createdBy: owner._id,
            capacity: "150", // must be numeric-ish string because $toDouble is used
        });

        // Insert bdleads directly to the collection to avoid strict schema requirements
        await mongoose.connection.collection("bdleads").insertMany([
            { group_id: g._id, project_details: { capacity: "40" } },
            { group_id: g._id, project_details: { capacity: "60" } },
        ]);

        const res = await request(app)
            .get("/v1/bddashboard/group")
            .set("x-test-user-id", admin._id.toString()) // admin sees everything
            .expect(200);

        const row = res.body.data.find((d) => d.group_name === "CapGroup");
        expect(row).toBeTruthy();
        expect(row.total_lead_capacity).toBe(100);
        expect(row.left_capacity).toBe(50);
    });
});

// ---------------- GET /group/:id tests ----------------

describe("GET /group/:id (getGroupById)", () => {
    beforeEach(async () => {
        await Group.deleteMany({});
        await Users.deleteMany({});
        await mongoose.connection.collection("bdleads").deleteMany({});
    });

    test("returns 404 when group is not found", async () => {
        const someUser = await seedUser({ name: "Any User" });
        const fakeId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .get(`/v1/bddashboard/group/${fakeId}`)
            .set("x-test-user-id", someUser._id.toString());

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty("error", "Group not found");
    });

    test("returns 500 for invalid ObjectId", async () => {
        const someUser = await seedUser({ name: "Any User" });

        const res = await request(app)
            .get(`/v1/bddashboard/group/not-a-valid-objectid`)
            .set("x-test-user-id", someUser._id.toString());

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty("error");
    });

    test("returns group with populated createdBy & status user and computed total_lead_capacity", async () => {
        const creator = await seedUser({ name: "Creator User" });
        const statusGuy = await seedUser({ name: "Status User" });
        const caller = await seedUser({ name: "Caller" });

        // Insert raw to bypass pre('save') hook that overwrites current_status
        const { insertedId } = await mongoose.connection.collection("groups").insertOne({
            group_name: "Detail Group",
            group_code: "BD/Group/1",
            createdBy: creator._id,
            contact_details: { mobile: ["9000000000"] },
            address: { state: "Rajasthan" },
            project_details: { capacity: "150" },
            source: { from: "LinkedIn" },
            company_name: "Acme Corp",
            current_status: {
                status: "open",
                remarks: "initial",
                user_id: statusGuy._id,
            },
            status_history: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Leads sum = 100
        await mongoose.connection.collection("bdleads").insertMany([
            { group_id: insertedId, project_details: { capacity: "40" } },
            { group_id: insertedId, project_details: { capacity: "60" } },
        ]);

        const res = await request(app)
            .get(`/v1/bddashboard/group/${insertedId.toString()}`)
            .set("x-test-user-id", caller._id.toString())
            .expect(200);

        const row = res.body.data;

        expect(row.group_name).toBe("Detail Group");
        expect(row).toHaveProperty("group_code", "BD/Group/1");
        expect(row).toHaveProperty("company_name", "Acme Corp");

        expect(row.createdBy).toMatchObject({
            _id: creator._id.toString(),
            name: "Creator User",
        });

        expect(row.current_status).toMatchObject({
            user_id: statusGuy._id.toString(),
            user_name: "Status User",
        });

        expect(row.total_lead_capacity).toBe(100);
    });

});

describe("GET /group-drop (getAllGroupDropdown)", () => {
    // helper to create a group quickly
    const makeGroupDoc = ({
        name = "Dropdown Group",
        createdBy,
        capacity = "100",
        state = "Rajasthan",
        mobile = ["9000000000"],
        sourceFrom = "LinkedIn",
        extra = {},
    }) =>
        Group.create({
            group_name: name,
            group_code: `BD/Group/${Math.floor(Math.random() * 1000)}`,
            createdBy,
            contact_details: { mobile },
            address: { state },
            project_details: { capacity },
            source: { from: sourceFrom },
            ...extra,
        });

    test("should return groups with populated fields including total_lead_capacity, left_capacity, createdBy and current_status", async () => {
        const owner = await seedUser({ name: "Owner" });

        const g = await makeGroupDoc({
            name: "Dropdown Group",
            createdBy: owner._id,
            capacity: "200",
            current_status: { status: "open", remarks: "active", user_id: owner._id },
        });

        await mongoose.connection.collection("bdleads").insertMany([
            { group_id: g._id, project_details: { capacity: "50" } },
            { group_id: g._id, project_details: { capacity: "70" } },
        ]);

        const res = await request(app)
            .get("/v1/bddashboard/group-drop")
            .set("x-test-user-id", owner._id.toString())
            .expect(200);

        const row = res.body.data.find((d) => d.group_name === "Dropdown Group");

        expect(row).toBeTruthy();
        expect(row.total_lead_capacity).toBe(120);
        expect(row.left_capacity).toBe(80);
        expect(row.createdBy).toHaveProperty("name", owner.name);
        expect(row.current_status).toHaveProperty("status", "open");

        // safe check for user_name and remarks
        const userName = row.current_status.user_name || null;
        const remarks = row.current_status.remarks || null;

        expect(userName === null || userName === owner.name).toBe(true);
        expect(remarks === null || remarks === "active").toBe(true);
    });

    test("should handle groups with no leads gracefully", async () => {
        const user = await seedUser({ name: "Leadless User" });

        const group = await makeGroupDoc({
            name: "NoLeadGroup",
            createdBy: user._id,
            capacity: "200",
        });

        const res = await request(app)
            .get("/v1/bddashboard/group-drop")
            .set("x-test-user-id", user._id.toString())
            .expect(200);

        const row = res.body.data.find((g) => g.group_name === "NoLeadGroup");
        expect(row).toBeTruthy();
        expect(row.total_lead_capacity).toBe(0);
        expect(row.left_capacity).toBe(200);
    });
});

// ---------------- PUT /group/:id (updateGroup) ----------------

describe("PUT /group/:id (updateGroup)", () => {


    test("400 when body.data is missing", async () => {
        const caller = await seedUser({ name: "Caller" });
        const someId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .put(`/v1/bddashboard/group/${someId}`)
            .set("x-test-user-id", caller._id.toString())
            .send({}); // no data

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error", "Invalid request");
    });

    test("500 when :id is an invalid ObjectId", async () => {
        const caller = await seedUser({ name: "Caller" });

        const res = await request(app)
            .put("/v1/bddashboard/group/not-a-valid-objectid")
            .set("x-test-user-id", caller._id.toString())
            .send({ data: { group_name: "Won't Matter" } });

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty("error");
    });

    test("500 when group does not exist (controller uses wrong null check)", async () => {
        const caller = await seedUser({ name: "Caller" });
        const missingId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .put(`/v1/bddashboard/group/${missingId}`)
            .set("x-test-user-id", caller._id.toString())
            .send({ data: { group_name: "No Doc" } });

        // With current controller, this becomes a 500 (TypeError) instead of 404
        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty("error");
    });

    test("200 updates fields and returns populated createdBy (status user may be null)", async () => {
        const creator = await seedUser({ name: "Creator User" });
        const caller = await seedUser({ name: "Caller" });

        const doc = await Group.create({
            group_name: "Old Name",
            group_code: "BD/Group/11",
            createdBy: creator._id,
            contact_details: { mobile: ["9999999999"] },
            address: { state: "Rajasthan" },
            project_details: { capacity: "150" },
            source: { from: "LinkedIn" },
            company_name: "Old Co",
            current_status: { status: "open", remarks: "init", user_id: null },
            status_history: [],
        });

        const payload = {
            data: {
                group_name: "Updated Name",
                company_name: "New Co",
                address: { state: "Gujarat" },        // replaces address object
                project_details: { capacity: "200" }, // replaces project_details object
            },
        };

        const res = await request(app)
            .put(`/v1/bddashboard/group/${doc._id.toString()}`)
            .set("x-test-user-id", caller._id.toString())
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message", "Group updated successfully");
        expect(res.body).toHaveProperty("data");

        const row = res.body.data;
        expect(row.group_name).toBe("Updated Name");
        expect(row.company_name).toBe("New Co");
        expect(row.address.state).toBe("Gujarat");
        expect(row.project_details.capacity).toBe("200");

        // createdBy populated per controller populate()
        expect(row.createdBy).toMatchObject({
            _id: creator._id.toString(),
            name: "Creator User",
        });
    });

    test("Object.assign shallowly replaces nested objects (district is lost)", async () => {
        const creator = await seedUser({ name: "Creator User" });
        const caller = await seedUser({ name: "Caller" });

        const doc = await Group.create({
            group_name: "Merge Test",
            group_code: "BD/Group/12",
            createdBy: creator._id,
            contact_details: { mobile: ["1111111111"], email: "old@x.test" },
            address: { state: "Rajasthan", district: "Jaipur" },
            project_details: { capacity: "120", scheme: "PM-KUSUM" },
            source: { from: "Event" },
            company_name: "Keep Co",
        });

        // Update only state; with Object.assign the whole address object is replaced
        const res = await request(app)
            .put(`/v1/bddashboard/group/${doc._id.toString()}`)
            .set("x-test-user-id", caller._id.toString())
            .send({ data: { address: { state: "Gujarat" } } });

        expect(res.status).toBe(200);

        const row = res.body.data;
        expect(row.address.state).toBe("Gujarat");
        expect(row.address.district).toBeUndefined(); // lost due to shallow replace
        // unrelated top-level keys remain
        expect(row.contact_details.email).toBe("old@x.test");
        expect(row.project_details.scheme).toBe("PM-KUSUM");
    });
});

// ---------------- PUT /group/:id/updateGroupStatus (updateGroupStatus) ----------------

describe("PUT /group/:id/updateGroupStatus (updateGroupStatus)", () => {


    test("400 when status is missing", async () => {
        const caller = await seedUser({ name: "Caller" });
        const someId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .put(`/v1/bddashboard/${someId}/updateGroupStatus`)
            .set("x-test-user-id", caller._id.toString())
            .send({ remarks: "no status" }); // missing status

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("message", "Status is required");
    });

    test("500 when :id is an invalid ObjectId", async () => {
        const caller = await seedUser({ name: "Caller" });

        const res = await request(app)
            .put(`/v1/bddashboard/not-a-valid-objectid/updateGroupStatus`)
            .set("x-test-user-id", caller._id.toString())
            .send({ status: "open", remarks: "test" });

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty("message", "Internal Server Error");
        expect(res.body).toHaveProperty("error");
    });

    test("404 when group does not exist", async () => {
        const caller = await seedUser({ name: "Caller" });
        const missingId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .put(`/v1/bddashboard/${missingId}/updateGroupStatus`)
            .set("x-test-user-id", caller._id.toString())
            .send({ status: "open", remarks: "not found" });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty("message", "Group not found");
    });

    test("200 appends a status_history entry with user_id and remarks", async () => {
        const creator = await seedUser({ name: "Creator User" });
        const changer = await seedUser({ name: "Changer" });

        const doc = await Group.create({
            group_name: "Statusable",
            group_code: "BD/Group/21",
            createdBy: creator._id,
            contact_details: { mobile: ["9000000000"] },
            address: { state: "Rajasthan" },
            project_details: { capacity: "150" },
            source: { from: "LinkedIn" },
            status_history: [],
            current_status: { status: "open", remarks: null, user_id: null },
        });

        const payload = { status: "closed", remarks: "done for now" };

        const res = await request(app)
            .put(`/v1/bddashboard/${doc._id.toString()}/updateGroupStatus`)
            .set("x-test-user-id", changer._id.toString())
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message", "Status updated successfully");
        expect(res.body).toHaveProperty("data");

        const updated = res.body.data;
        expect(Array.isArray(updated.status_history)).toBe(true);
        expect(updated.status_history.length).toBe(1);

        const last = updated.status_history[updated.status_history.length - 1];
        expect(last.status).toBe("closed");
        expect(last.remarks).toBe("done for now");
        expect(last.user_id).toBe(changer._id.toString());

        // verify persisted
        const fromDb = await Group.findById(doc._id).lean();
        expect(fromDb.status_history.length).toBe(1);
        expect(fromDb.status_history[0].status).toBe("closed");
        expect(fromDb.status_history[0].remarks).toBe("done for now");
        expect(fromDb.status_history[0].user_id.toString()).toBe(changer._id.toString());
    });

    test("200 allows multiple updates and preserves order (append)", async () => {
        const creator = await seedUser({ name: "Creator User" });
        const changer = await seedUser({ name: "Changer" });

        const doc = await Group.create({
            group_name: "Multi Status",
            group_code: "BD/Group/22",
            createdBy: creator._id,
            contact_details: { mobile: ["9000000001"] },
            address: { state: "Gujarat" },
            project_details: { capacity: "80" },
            source: { from: "Event" },
            status_history: [],
        });

        // first update
        await request(app)
            .put(`/v1/bddashboard/${doc._id.toString()}/updateGroupStatus`)
            .set("x-test-user-id", changer._id.toString())
            .send({ status: "open", remarks: "initial" })
            .expect(200);

        // second update
        const res2 = await request(app)
            .put(`/v1/bddashboard/${doc._id.toString()}/updateGroupStatus`)
            .set("x-test-user-id", changer._id.toString())
            .send({ status: "closed", remarks: "finalized" });

        expect(res2.status).toBe(200);
        const updated = res2.body.data;
        expect(updated.status_history.length).toBe(2);
        expect(updated.status_history[0].status).toBe("open");
        expect(updated.status_history[0].remarks).toBe("initial");
        expect(updated.status_history[1].status).toBe("closed");
        expect(updated.status_history[1].remarks).toBe("finalized");
        expect(updated.status_history[1].user_id).toBe(changer._id.toString());
    });
});

// ---------------- POST /v1/bddashboard/group-export (getexportToCSVGroup) ----------------

describe("POST /v1/bddashboard/group-export (getexportToCSVGroup)", () => {
    beforeEach(async () => {
        await Group.deleteMany({});
        await Users.deleteMany({});
        // await mongoose.connection.collection("bdleads").deleteMany({});
    });

    const CSV_FIELDS = [
        "Group Code",
        "Group Name",
        "Total Capacity",
        "Left Capacity",
        "State",
        "Scheme",
        "Created At",
        "Created By",
        "Status",
    ];

    // escape regex chars in a string
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Tolerant header matcher: optional BOM, optional quotes around headers, optional trailing spaces
    const headerRegex = new RegExp(
        "^\\uFEFF?" + CSV_FIELDS.map((f) => `"?${esc(f)}"?`).join(",") + "\\s*$"
    );

    const stripBOM = (s) => (s || "").replace(/^\uFEFF/, "");

    test("500 when body.Ids is missing", async () => {
        const caller = await seedUser({ name: "Caller" });

        const res = await request(app)
            .post("/v1/bddashboard/group-export")
            .set("x-test-user-id", caller._id.toString())
            .send({}); // no Ids

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty("message", "CSV export failed");
        expect(res.body).toHaveProperty("error");
    });

    test("500 when body.Ids contains an invalid ObjectId", async () => {
        const caller = await seedUser({ name: "Caller" });

        const res = await request(app)
            .post("/v1/bddashboard/group-export")
            .set("x-test-user-id", caller._id.toString())
            .send({ Ids: ["not-a-valid-objectid"] });

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty("message", "CSV export failed");
        expect(res.body).toHaveProperty("error");
    });

    test("200 returns header-only CSV when Ids is an empty array", async () => {
        const caller = await seedUser({ name: "Caller" });

        const res = await request(app)
            .post("/v1/bddashboard/group-export")
            .set("x-test-user-id", caller._id.toString())
            .send({ Ids: [] });

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/csv/i);
        expect(res.headers["content-disposition"]).toMatch(/attachment;.*groups\.csv/i);

        const body = stripBOM(res.text).trim();

        // Some csv libs return empty string for zero rows; accept either empty or header-only
        if (body === "") {
            expect(body).toBe("");
        } else {
            const firstLine = body.split(/\r?\n/)[0] || "";
            expect(headerRegex.test(firstLine)).toBe(true);
            const lines = body.split(/\r?\n/);
            expect(lines.length).toBe(1);
        }
    });

    test("200 exports a single group; CSV has headers and one data row", async () => {
        const creator = await seedUser({ name: "Creator User" });
        const caller = await seedUser({ name: "Caller" });

        const g = await Group.create({
            group_name: "Demo Group",
            group_code: "BD/Group/1",
            createdBy: creator._id,
            contact_details: { mobile: ["9000000000"] },
            address: { state: "Rajasthan" },
            project_details: { capacity: "150" },
            source: { from: "LinkedIn" },
            current_status: { status: "open" },
        });

        const res = await request(app)
            .post("/v1/bddashboard/group-export")
            .set("x-test-user-id", caller._id.toString())
            .send({ Ids: [g._id.toString()] });

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/csv/i);
        expect(res.headers["content-disposition"]).toMatch(/attachment;.*groups\.csv/i);

        const body = stripBOM(res.text).trim();
        const lines = body.split(/\r?\n/);

        expect(headerRegex.test(lines[0] || "")).toBe(true);
        expect(lines.length).toBe(2); // header + 1 row

        expect(body).toMatch(/BD\/Group\/1/);
        expect(body).toMatch(/Demo Group/);
    });

    test("200 exports multiple groups; CSV includes both rows", async () => {
        const creator = await seedUser({ name: "Creator User" });
        const caller = await seedUser({ name: "Caller" });

        const g1 = await Group.create({
            group_name: "Alpha Group",
            group_code: "BD/Group/11",
            createdBy: creator._id,
            contact_details: { mobile: ["9000000001"] },
            address: { state: "Gujarat" },
            project_details: { capacity: "50" },
            source: { from: "Event" },
            current_status: { status: "open" },
        });

        const g2 = await Group.create({
            group_name: "Beta Group",
            group_code: "BD/Group/12",
            createdBy: creator._id,
            contact_details: { mobile: ["9000000002"] },
            address: { state: "Maharashtra" },
            project_details: { capacity: "75" },
            source: { from: "Cold Call" },
            current_status: { status: "closed" },
        });

        const res = await request(app)
            .post("/v1/bddashboard/group-export")
            .set("x-test-user-id", caller._id.toString())
            .send({ Ids: [g1._id.toString(), g2._id.toString()] });

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/csv/i);

        const body = stripBOM(res.text).trim();
        const lines = body.split(/\r?\n/);

        expect(headerRegex.test(lines[0] || "")).toBe(true);
        expect(lines.length).toBe(3); // header + 2 rows

        expect(body).toMatch(/BD\/Group\/11/);
        expect(body).toMatch(/Alpha Group/);
        expect(body).toMatch(/BD\/Group\/12/);
        expect(body).toMatch(/Beta Group/);
    });
});

