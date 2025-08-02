const express = require("express");
const mongoose = require("mongoose");
const app = express();
const routes = require("../src/Routes/routes");
const engineeringRoutes = require("../src/Routes/engineering/engineeringRoutes");
const bdleadsRoutes = require("../src/Routes/bdleads/bdleadDashboardRoutes");
const dprRoutes = require("../src/Routes/dpr/dprRoutes");
const purchaseRoutes = require("../src/Routes/purchaseRequest/purchaseRequestRoutes");
const taskRoutes = require("../src/Routes/tasks/tasks");
const accountingRoutes = require("../src/Routes/Accounting/accountingRoutes");
const poRoutes = require("../src/Routes/OldPO/PoRoutes");
const cors = require("cors");
const { config } = require("dotenv");
const cookieParser = require("cookie-parser");
const http = require("http");
const socketIo = require("socket.io");

config({
  path: "./.env",
});

const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://sales.slnkoprotrac.com",
      "https://slnkoprotrac.com",
      "https://dev.slnkoprotrac.com",
      "https://staging.slnkoprotrac.com",
    ],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("WebSocket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("WebSocket disconnected:", socket.id);
  });

  socket.on("ping", () => {
    socket.emit("pong");
  });
});

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://sales.slnkoprotrac.com",
  "https://slnkoprotrac.com",
  "https://dev.slnkoprotrac.com",
  "https://staging.slnkoprotrac.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.set("io", io);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT;
const db = process.env.DB_URL;

const startServer = async () => {
  try {
    await mongoose.connect(db, {});
    console.log("SlnkoEnergy database is connected");

    app.use("/v1", routes);
    app.use("/v1/engineering", engineeringRoutes);
    app.use("/v1/bddashboard", bdleadsRoutes);
    app.use("/v1/dpr", dprRoutes);
    app.use("/v1/purchaseRequest", purchaseRoutes);
    app.use("/v1/tasks", taskRoutes);
    app.use("/v1/oldpo", poRoutes);
    app.use("/v1/accounting", accountingRoutes);

    // Start the server
    server.listen(PORT, () => {
      console.log(`Slnko app is running on port ${PORT}`);
    });

    process.on("SIGINT", () => {
      console.log("Gracefully shutting down...");
      mongoose.connection.close(() => {
        console.log("MongoDB connection closed");
        process.exit(0);
      });
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

// Start the server
startServer();
