// src/utils/cache.js
const { getClient } = require("./redisClient");

const DEFAULT_TTL = Number(process.env.REDIS_TTL_SECONDS || 900);

// -------------------- basic helpers (unchanged) --------------------
function keyWithPrefix(key, prefix) {
  return prefix ? `${prefix}:${key}` : key;
}

async function getJson(key) {
  const client = await getClient();
  if (!client) return null; // gracefully no-op if Redis not available (local)
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
    await client.set(key, payload); // no expiry
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

// -------------------- namespace versioning --------------------
// Keys are built like: `${prefix}:v=${version}|...` by your controller.
// Bumping the version makes all *new* reads miss immediately (fresh recompute),
// while old keys expire naturally via TTL (no heavy SCAN+DEL).

const NS_KEY = (ns) => `nsver:${ns}`;
const NS_CH  = (ns) => `nsbump:${ns}`; // pub/sub channel for optional live updates

// Get current namespace version (defaults to 1 if missing or Redis is absent)
async function getNamespaceVersion(ns) {
  const client = await getClient();
  if (!client) return 1;
  let v = await client.get(NS_KEY(ns));
  if (!v) {
    await client.set(NS_KEY(ns), "1");
    return 1;
  }
  return Number(v) || 1;
}

// Bump namespace version to invalidate future reads immediately.
// Also publishes the new version on a channel so you can auto-refetch in UI.
async function bumpNamespaceVersion(ns) {
  const client = await getClient();
  if (!client) return true; // no Redis locally -> no-op
  const newVer = await client.incr(NS_KEY(ns));
  try {
    await client.publish(NS_CH(ns), String(newVer));
  } catch (_) {
    // ignore pub errors; invalidation via version still works
  }
  return true;
}

// Optional: subscribe to bumps (handy if you want server push -> websockets/SSE)
// Usage:
//   const unsubscribe = await subscribeNamespaceBumps('pb:projectBalance', (v)=>{ ... });
//   // later: await unsubscribe();
async function subscribeNamespaceBumps(ns, onBump) {
  const client = await getClient();
  if (!client) return async () => {};
  const sub = client.duplicate();
  await sub.connect();
  await sub.subscribe(NS_CH(ns), (message) => {
    const ver = Number(message) || null;
    try { onBump?.(ver); } catch (e) { /* swallow */ }
  });
  return async () => {
    try { await sub.unsubscribe(NS_CH(ns)); } catch (_) {}
    try { await sub.quit(); } catch (_) {}
  };
}

module.exports = {
  DEFAULT_TTL,
  getJson,
  setJson,
  delKeys,
  withPrefix,
  // new exports:
  getNamespaceVersion,
  bumpNamespaceVersion,
  subscribeNamespaceBumps,
};
