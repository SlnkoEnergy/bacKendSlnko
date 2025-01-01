require("dotenv").config();
const fs = require('fs');
const https = require('https');
const express = require("express");
const mongoose = require("mongoose");
const cluster = require("cluster");
const os = require("os");
const app = express();
const routes = require("../src/Routes/routes");
//const numCPUs = os.cpus().length;

const cors = require("cors");
const { config } = require("dotenv");
const Option = {
   key: fs.readFileSync('/etc/letsencrypt/live/api.slnkoprotrac.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/api.slnkoprotrac.com/fullchain.pem')
};

config({
  path: "./.env"
})

app.use(cors(Option));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



const PORT = process.env.PORT;
const db = process.env.db;
https.createServer(Option, app).listen(0, '127.0.0.1', () => {
    console.log('Node.js app is running on https://localhost:5000');
});


// Function to start the server in each worker process
// const startServer = () => {
//   // Connect to MongoDB using Mongoose
//   mongoose.connect(process.env.db,{
  
//   } )
    
//     .then(() => console.log("SlnkoEnergy database is connected"))
//     .catch((err) => console.log("Database connection error: ", err));

//   // Use routes defined in the `routes` module
//   app.use("/v1", routes);

 

//   // Start the server on the specified port (or default to 8080)
//   app.listen( process.env.PORT, function () {
//     console.log(`Slnko app is running on port ${process.env.PORT}`);
//   });

//   // Gracefully handle shutdown on SIGINT (Ctrl+C)
//   process.on("SIGINT", () => {
//     console.log("Gracefully shutting down...");
//     mongoose.connection.close(() => {
//       console.log("MongoDB connection closed");
//       process.exit(0);
//     });
//   });
// };

// // If the current process is the master, fork workers
// if (cluster.isMaster) {
//   console.log(`Master process is running on PID: ${process.pid}`);

//   // Fork workers based on the number of CPU cores
//   for (let i = 0; i < numCPUs; i++) {
//     cluster.fork(); // Creates a new worker
//   }

//   // Listen for dying workers and respawn them
//   cluster.on("exit", (worker, code, signal) => {
//     console.log(`Worker ${worker.process.pid} died`);
//     cluster.fork(); // Fork a new worker when one dies
//   });
// } else {
//   // If this is a worker, start the server
//   startServer();
// }



const startServer = async () => {
  try {
    // Connect to MongoDB using Mongoose
    await mongoose.connect(db, {
     
    });
    console.log("SlnkoEnergy database is connected");

    // Use routes defined in the `routes` module
    app.use("/v1", routes);

    // Start the server
    app.listen(PORT, () => {
      console.log(`Slnko app is running on port ${PORT}`);
    });

    // Gracefully handle shutdown on SIGINT (Ctrl+C)
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
