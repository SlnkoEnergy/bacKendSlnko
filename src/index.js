const express = require("express");
const mongoose = require("mongoose");
const cluster = require("cluster");
//require("dotenv").config();
const os = require("os");
const app = express();
const routes = require("../src/Routes/routes");
const numCPUs = os.cpus().length;

const cors = require("cors");
const { config } = require("dotenv");
const Option = {
  origin: "*",
};

config({
  path: "./.env"
})

app.use(cors(Option));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



const PORT = process.env.PORT;
const db = process.env.db;

// Function to start the server in each worker process
const startServer = () => {
  // Connect to MongoDB using Mongoose
  mongoose.connect(db)
    
    .then(() => console.log("SlnkoEnergy database is connected"))
    .catch((err) => console.log("Database connection error: ", err));

  // Use routes defined in the `routes` module
  app.use("/v1", routes);

 

  // Start the server on the specified port (or default to 8080)
  app.listen(process.env.PORT, function () {
    console.log(`Slnko app is running on port ${process.env.PORT}`);
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
