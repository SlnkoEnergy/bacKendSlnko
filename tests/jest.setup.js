const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;

jest.setTimeout(30000);

beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    process.env.MONGO_URI = uri;  
    process.env.NODE_ENV = "test"; 
});

afterEach(async () => {
    const { collections } = mongoose.connection;
    for (const name of Object.keys(collections)) {
        await collections[name].deleteMany({});
    }
});

afterAll(async () => {
    await mongoose.connection.dropDatabase().catch(() => { });
    await mongoose.disconnect().catch(() => { });
    if (mongoServer) await mongoServer.stop();
});