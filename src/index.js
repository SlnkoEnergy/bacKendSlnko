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
const scopeRoutes = require("../src/Routes/scope.routes");
const cors = require("cors");
const { config } = require("dotenv");
const cookieParser = require("cookie-parser");
const http = require("http");
const Sentry = require("@sentry/node");
const Tracing = require("@sentry/tracing");

Sentry.init({
  dsn: "https://50b42b515673cd9e4c304951d05cdc44@o4509774671511552.ingest.us.sentry.io/4509774818508800",
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Tracing.Integrations.Express({ app }),
  ],
  tracesSampleRate: 1.0,
});

config({ path: "./.env" });

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
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const PORT = process.env.PORT;
const db = process.env.DB_DEVELOPMENT_URL;

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
    app.use("/v1/scope", scopeRoutes);

    app.listen(PORT, () => {
      console.log(`Slnko app is running on port ${PORT}`);
    });

    app.use(Sentry.Handlers.errorHandler());
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

startServer();
