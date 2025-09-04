
const { getClient } = require("./redisClient");

const DEFAULT_TTL = Number(process.env.REDIS_TTL_SECONDS || 900);

function keyWithPrefix(key, prefix) {
  return prefix ? `${prefix}:${key}` : key;
}

async function getJson(key) {
  const client = await getClient();
  if (!client) return null;
  const raw = await client.get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function setJson(key, value, ttlSeconds = DEFAULT_TTL) {
  const client = await getClient();
  if (!client) return false;
  const payload = typeof value === "string" ? value : JSON.stringify(value);
  if (ttlSeconds && ttlSeconds > 0) {
    await client.setEx(key, ttlSeconds, payload);
  } else {
    await client.set(key, payload);
  }
  return true;
}

async function delKeys(keys) {
  const client = await getClient();
  if (!client) return 0;
  if (!Array.isArray(keys)) keys = [keys];
  return client.del(keys);
}

function withPrefix(prefix) {
  return {
    get: (k) => getJson(keyWithPrefix(k, prefix)),
    set: (k, v, ttl) => setJson(keyWithPrefix(k, prefix), v, ttl),
    del: (kOrKs) =>
      Array.isArray(kOrKs)
        ? delKeys(kOrKs.map((k) => keyWithPrefix(k, prefix)))
        : delKeys(keyWithPrefix(kOrKs, prefix)),
  };
}

module.exports = {
  DEFAULT_TTL,
  getJson,
  setJson,
  delKeys,
  withPrefix,
};
