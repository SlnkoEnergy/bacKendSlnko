const { createClient } = require("redis");

let client;
let ready = false;

async function getRedis() {
  if (client && ready) return client;

  const url = (process.env.REDIS_URL && process.env.REDIS_URL.trim());

  client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 200, 10_000),
    },
  });

  client.on("ready", () => {
    ready = true;
    console.log("[redis] connected →", url);
  });

  client.on("error", (e) => {
    ready = false;
    console.error("[redis] error:", e?.message || e);
  });

  if (!client.isOpen) await client.connect();
  return client;
}

module.exports = { getRedis };
