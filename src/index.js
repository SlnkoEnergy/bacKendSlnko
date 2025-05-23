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
//    key: fs.readFileSync('/etc/letsencrypt/live/api.slnkoprotrac.com/privkey.pem'),
//     cert: fs.readFileSync('/etc/letsencrypt/live/api.slnkoprotrac.com/fullchain.pem')
// };

// config({
//   path: "./.env"
// })

// app.use(cors(Option));
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));



// // const PORT = process.env.PORT;   comeentout kiye hai 

// const db = process.env.DB_URL;
// https.createServer(Option, app).listen(5000, '127.0.0.1', () => {
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

//     // Start the server comment out kiye hai
//     // app.listen(PORT, () => {
//     //   console.log(`Slnko app is running on port ${PORT}`);
//     // });

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
const cluster = require("cluster");


const app = express();
const routes = require("../src/Routes/routes");


const cors = require("cors");
const { config } = require("dotenv");


config({
 path: "./.env"
});


app.use(cors({ origin: "*" })); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 4000; // Default to 5000 if PORT is not set
//const db = process.env.DB_DEVELOPMENT_URL;
 const DB_DEVELOPMENT_URL="mongodb+srv://it:slnkoEnergy@cluster0.nj3x6.mongodb.net/development?retryWrites=true&w=majority&appName=Cluster0"


const startServer = async () => {
try {
  
  await mongoose.connect(DB_DEVELOPMENT_URL, {
    
  });
  console.log("SlnkoEnergy database is connected");


  app.use("/v1", routes);

  // Start the server
  app.listen(PORT, () => {
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