
const { createClient } = require("redis");

let client;
let ready = false;

async function getRedis() {
  if (client && ready) {
    console.log("[redis] Reusing existing client");
    return client;
  }

  const url = (process.env.REDIS_URL || "").trim();
  console.log("[redis] Initializing client with URL →", url || "(empty)");

  try {
    client = createClient({
      url,
      socket: {
        connectTimeout: 5000, // fail faster if unreachable
        reconnectStrategy: (retries) => {
          const delay = Math.min(retries * 200, 10_000);
          console.log(`[redis] reconnect attempt #${retries}, waiting ${delay}ms`);
          return delay;
        },
      },
    });

    // attach events **before** connecting
    client.on("ready", () => {
      ready = true;
      console.log("[redis] ✅ connected →", url);
    });

    client.on("end", () => {
      ready = false;
      console.warn("[redis] ⚠️ disconnected");
    });

    client.on("error", (e) => {
      ready = false;
      console.error("[redis] ❌ error:", e?.message || e);
    });

    if (!client.isOpen) {
      console.log("[redis] Connecting to server…");
      await client.connect();
      console.log("[redis] connect() promise resolved");
    } else {
      console.log("[redis] Client was already open");
    }
  } catch (err) {
    console.error("[redis] ❌ Failed to connect:", err.message || err);
    throw err; // bubble up to caller
  }

  return client;
}

module.exports = { getRedis };
