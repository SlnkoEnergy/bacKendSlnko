const express = require("express");
const mongoose = require("mongoose");
const cluster = require("cluster");
const os = require("os");
const app = express();
const routes = require("../src/Routes/routes");

// Number of CPU cores available on the system
const numCPUs = os.cpus().length;

const cors = require("cors");
const Option = {
  origin: "*",
};

// Enable CORS with the specified options
app.use(cors(Option));

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection URI
const dbURI =
  "mongodb+srv://it:slnkoEnergy@cluster0.nj3x6.mongodb.net/slnko?retryWrites=true&w=majority&appName=Cluster0";

// Function to start the server in each worker process
const startServer = () => {
  // Connect to MongoDB using Mongoose
  mongoose
    .connect(dbURI, {})
    .then(() => console.log("SlnkoEnergy database is connected"))
    .catch((err) => console.log("Database connection error: ", err));

  // Use routes defined in the `routes` module
  app.use("/v1", routes);

  // Start the server on the specified port (or default to 8080)
  app.listen(process.env.PORT || 8080, function () {
    console.log(`Slnko app is running on port ${process.env.PORT || 8080}`);
  });

  // Gracefully handle shutdown on SIGINT (Ctrl+C)
  process.on("SIGINT", () => {
    console.log("Gracefully shutting down...");
    mongoose.connection.close(() => {
      console.log("MongoDB connection closed");
      process.exit(0);
    });
  });
};

// If the current process is the master, fork workers
if (cluster.isMaster) {
  console.log(`Master process is running on PID: ${process.pid}`);

  // Fork workers based on the number of CPU cores
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork(); // Creates a new worker
  }

  // Listen for dying workers and respawn them
  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork(); // Fork a new worker when one dies
  });
} else {
  // If this is a worker, start the server
  startServer();
}
