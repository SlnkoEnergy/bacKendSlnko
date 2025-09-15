const express = require("express");
const mongoose = require("mongoose");
const app = express();

const routes = require("../src/Routes/routes");
const engineeringRoutes = require("./Routes/engineering.routes");
const bdleadsRoutes = require("../src/Routes/bdleads.routes");
const dprRoutes = require("../src/Routes/dpr.routes");
const purchaseRoutes = require("../src/Routes/purchaserequest.routes");
const taskRoutes = require("./Routes/tasks.routes");
const accountingRoutes = require("../src/Routes/Accounting/accountingRoutes");
const scopeRoutes = require("../src/Routes/scope.routes");
const productRoutes = require("../src/Routes/products.routes");
const logisticRoutes = require("../src/Routes/logistics.routes");
const historyRoutes = require("./Routes/Pohistory.routes");
const billRoutes = require("../src/Routes/bill.routes");
const inspectionRoutes = require("../src/Routes/inspection.routes");

const cors = require("cors");
const { config } = require("dotenv");
const cookieParser = require("cookie-parser");

Sentry.init({
  dsn: "https://50b42b515673cd9e4c304951d05cdc44@o4509774671511552.ingest.us.sentry.io/4509774818508800",
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Tracing.Integrations.Express({ app }),
  ],
  send_default_pii: true,
  tracesSampleRate: 1.0,
});
config({ path: "./.env" });
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];

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

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ⚠️ Mount ALL routes up-front so they exist in tests too
app.use("/v1", routes);
app.use("/v1/engineering", engineeringRoutes);
app.use("/v1/bddashboard", bdleadsRoutes);
app.use("/v1/dpr", dprRoutes);
app.use("/v1/purchaseRequest", purchaseRoutes);
app.use("/v1/tasks", taskRoutes);
app.use("/v1/accounting", accountingRoutes);
app.use("/v1/scope", scopeRoutes);
app.use("/v1/products", productRoutes);
app.use("/v1/logistics", logisticRoutes);
app.use("/v1/history", historyRoutes);
app.use("/v1/bill", billRoutes);
app.use("/v1/inspection", inspectionRoutes);

// ⚠️ Initialize Sentry only outside tests (after app is created and routes are mounted)
if (process.env.NODE_ENV !== "test") {
  Sentry.init({
    dsn: "https://50b42b515673cd9e4c304951d05cdc44@o4509774671511552.ingest.us.sentry.io/4509774818508800",
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Tracing.Integrations.Express({ app }),
    ],
    send_default_pii: true,
    tracesSampleRate: 1.0,
  });

  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

const PORT = process.env.PORT || 8080;
const db = process.env.DB_DEVELOPMENT_URL || process.env.MONGO_URI;

const startServer = async () => {
  try {
    // No deprecated options (driver v4+)
    await mongoose.connect(db, {});
    console.log("SlnkoEnergy database is connected");

    app.listen(PORT, () => {
      console.log(`Slnko app is running on port ${PORT}`);
    });

    if (process.env.NODE_ENV !== "test") {
      app.use(Sentry.Handlers.errorHandler());
    }

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

if (process.env.NODE_ENV !== "test" && require.main === module) {
  startServer();
}

module.exports = app;