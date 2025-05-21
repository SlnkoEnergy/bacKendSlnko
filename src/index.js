// // // // // // // deploy code api.slnkoprotrac.com
// require("dotenv").config();
// const fs = require('fs');
// const https = require('https');
// const express = require("express");
// const mongoose = require("mongoose");
// const cluster = require("cluster");
// const os = require("os");
// const app = express();
// const routes = require("../src/Routes/routes");
// //const numCPUs = os.cpus().length;

// const cors = require("cors");
// const { config } = require("dotenv");
// const Option = {
//    key: fs.readFileSync('/etc/letsencrypt/live/dev.api.slnkoprotrac.com/privkey.pem'),
//     cert: fs.readFileSync('/etc/letsencrypt/live/dev.api.slnkoprotrac.com/fullchain.pem')
// };

// config({
//   path: "./.env"
// })

// app.use(cors(Option));
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));





// const db = process.env.DB_DEVELOPMENT_URL;
// https.createServer(Option, app).listen(5001, '127.0.0.1', () => {
//     console.log('Node.js app is running on https://localhost:5000');
// });
// const startServer = async () => {
//   try {
//     // Connect to MongoDB using Mongoose
//     await mongoose.connect(db, {

//     });
//     console.log("SlnkoEnergy database is connected");

//     // Use routes defined in the `routes` module
//     app.use("/v1", routes);

//     // Gracefully handle shutdown on SIGINT (Ctrl+C)
//     process.on("SIGINT", () => {
//       console.log("Gracefully shutting down...");
//       mongoose.connection.close(() => {
//         console.log("MongoDB connection closed");
//         process.exit(0);
//       });
//     });
//   } catch (err) {
//     console.error("Failed to start server:", err);
//     process.exit(1);
//   }
// };

// // Start the server
// startServer();





















































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
