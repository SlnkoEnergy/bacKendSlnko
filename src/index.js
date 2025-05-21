const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { config } = require("dotenv");
const routes = require("../src/Routes/routes");

// Load environment variables
config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT_DEV;
const DB_URI = process.env.DB_DEVELOPMENT_URL;

const startServer = async () => {
  try {
    // Clean Mongoose connection
    await mongoose.connect(DB_URI);
    console.log("✅ MongoDB connected");

    // Routes
    app.use("/v1", routes);

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n🛑 Gracefully shutting down...");
      await mongoose.connection.close();
      console.log("✅ MongoDB connection closed");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Server failed to start:", error);
    process.exit(1);
  }
};

startServer();
