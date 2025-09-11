
// const { createClient } = require("redis");

// let client;
// let isReady = false;

// async function initRedis() {
//   if (client && isReady) return client;

//   const url = process.env.REDIS_URL;
//   if (!url) {
//     console.warn("[redis] REDIS_URL not set. Skipping Redis init.");
//     return null;
//   }

//   client = createClient({
//     url,
//     socket: {
//       reconnectStrategy: (retries) => Math.min(retries * 50, 1000),
//     },
//   });

//   client.on("error", (err) => {
//     isReady = false;
//     console.error("[redis] Client error:", err.message);
//   });

//   client.on("ready", () => {
//     isReady = true;
//     console.log("[redis] Connected and ready.");
//   });

//   await client.connect();
//   return client;
// }

// async function getClient() {
//   if (client && isReady) return client;
//   return initRedis();
// }

// async function quitRedis() {
//   if (client) {
//     try {
//       await client.quit();
//     } catch (e) {
//       console.error("[redis] quit error:", e.message);
//     } finally {
//       client = null;
//       isReady = false;
//     }
//   }
// }

// function isRedisReady() {
//   return !!(client && isReady);
// }

// module.exports = {
//   initRedis,
//   getClient,
//   quitRedis,
//   isRedisReady,
// };
