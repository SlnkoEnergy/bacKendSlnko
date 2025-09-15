const express = require("express");
const mongoose = require("mongoose");
const app = express();
const routes = require("./Routes/routes");
const engineeringRoutes = require("./Routes/engineering.routes");
const bdleadsRoutes = require("./Routes/bdleads.routes");
const dprRoutes = require("./Routes/dpr.routes");
const purchaseRoutes = require("./Routes/purchaserequest.routes");
const taskRoutes = require("./Routes/tasks.routes");
const accountingRoutes = require("./Routes/accounting.routes");
const scopeRoutes = require("./Routes/scope.routes");
const productRoutes = require("./Routes/products.routes");
const logisticRoutes = require("./Routes/logistics.routes");
const historyRoutes = require("./Routes/Pohistory.routes");
const billRoutes = require("./Routes/bill.routes");
const inspectionRoutes = require("./Routes/inspection.routes");
const postsRoutes = require("./Routes/posts.routes");
const handoverRoutes = require("./Routes/handover.routes");
const cors = require("cors");
const { config } = require("dotenv");
const cookieParser = require("cookie-parser");
const Sentry = require("@sentry/node");
const Tracing = require("@sentry/tracing");
require("../src/utils/cron/inactivelead.cron.utils");
require("../src/utils/cron/movetotrash.cron.utils");

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
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
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
    app.use("/v1/accounting", accountingRoutes);
    app.use("/v1/scope", scopeRoutes);
    app.use("/v1/products", productRoutes);
    app.use("/v1/logistics", logisticRoutes);
    app.use("/v1/history", historyRoutes);
    app.use("/v1/bill", billRoutes);
    app.use("/v1/inspection", inspectionRoutes);
    app.use("/v1/posts", postsRoutes);
    app.use("/v1/handover", handoverRoutes);

    app.listen(PORT, () => {
      console.log(`Slnko app is running on port ${PORT}`);
    });

    app.use(Sentry.Handlers.errorHandler());

    process.on("SIGINT", async () => {
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