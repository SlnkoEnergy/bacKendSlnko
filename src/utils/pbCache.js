const crypto = require("crypto");
const { getRedis } = require("./redisClient");
const VER_KEY = "pb:ver";

const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");

async function getVersion() {
  const r = await getRedis();
  let ver = await r.get(VER_KEY);
  if (!ver) { ver = Date.now().toString(36); await r.set(VER_KEY, ver); }
  return ver;
}

async function bumpVersion(reason = "") {
  const r = await getRedis();
  const ver = Date.now().toString(36);
  await r.set(VER_KEY, ver);
  if (reason) await r.set("pb:ver:last_reason", reason, { EX: 3600 });
  return ver;
}

function keyFor(ver, q) {
  const j = JSON.stringify({
    page: parseInt(q.page) || 1,
    pageSize: parseInt(q.pageSize) || 10,
    search: (q.search || "").trim(),
    group: (q.group || "").trim(),
  });
  return `pb:${ver}:${sha1(j)}`;
}

async function cacheGet(q) {
  const r = await getRedis();
  const ver = await getVersion();
  const key = keyFor(ver, q);
  const raw = await r.get(key);
  return { ver, key, raw };
}

async function cacheSet(ver, q, value, ttlSec = 120) {
  const r = await getRedis();
  const key = keyFor(ver, q);
  await r.set(key, JSON.stringify(value), { EX: ttlSec });
  return key;
}

module.exports = { cacheGet, cacheSet, bumpVersion, getVersion };
