const axios = require("axios");
const fs = require("fs");
const path = require("path");

const ODOO_BASE_URL = "https://odoo.api.slnkoprotrac.com/api/purchaseOrders";
const ODOO_API_KEY = "hello_api3089385928395";

// Save OUTSIDE src/
const DATA_DIR = path.join(process.cwd(), "data");
const OUTPUT_FILE = path.join(DATA_DIR, "odoo_final.json");
const STATE_FILE = path.join(DATA_DIR, "odoo_state.json");
const LOCK_FILE = path.join(DATA_DIR, "odoo_sync.lock");

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchWithRetry(url, retries = 3, timeoutMs = 60000) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await axios.get(url, { timeout: timeoutMs });
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      console.warn(`⚠️ Request failed (attempt ${attempt}): ${err.message}`);
      await sleep(500 * attempt);
    }
  }
}

// --- tiny helpers for state & file management ---
function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { lastPage: 0, isClosed: true, itemsWritten: 0 };
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function hasLock() {
  return fs.existsSync(LOCK_FILE);
}

function createLock() {
  fs.writeFileSync(LOCK_FILE, String(Date.now()));
}

function removeLock() {
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
}

/**
 * Ensure OUTPUT_FILE is ready to append valid JSON array:
 * - If file doesn't exist → write header `{"fetched_at": "...","data":[`
 * - If file exists and previously closed (`]}` at end) → remove the closing to continue appending
 * Returns { firstItem: boolean } telling whether the next append needs comma or not.
 */
function prepareOutputFile(isClosed, itemsWritten) {
  if (!fs.existsSync(OUTPUT_FILE)) {
    fs.writeFileSync(
      OUTPUT_FILE,
      `{"fetched_at":"${new Date().toISOString()}","data":[\n`
    );
    return { firstItem: true };
  }

  // If we closed last time, strip the final "\n]}" so we can append more
  if (isClosed) {
    const content = fs.readFileSync(OUTPUT_FILE, "utf-8");
    const trimmed = content.replace(/\s*\]\}\s*$/, ""); // remove closing
    fs.writeFileSync(OUTPUT_FILE, trimmed);
  }

  // If items already written, we’re not at first item anymore
  return { firstItem: itemsWritten === 0 };
}

function finalizeOutputFile() {
  // Close array & object
  fs.appendFileSync(OUTPUT_FILE, "\n]}");
}

/**
 * Main crawl that:
 * - resumes from lastPage + 1
 * - ignores has_next and stops only when the API returns 0 items
 * - writes one item at a time to avoid memory spikes
 * - persists progress to STATE_FILE
 */
async function crawlAll(limit = 1) {
  ensureDataDir();

  if (hasLock()) {
    console.log("⏳ Sync already running. Exiting.");
    return { message: "Already running", resumed: false };
  }
  createLock();

  try {
    const state = readState();
    let page = state.lastPage + 1; // resume
    let itemsWritten = state.itemsWritten || 0;

    const { firstItem } = prepareOutputFile(
      state.isClosed ?? true,
      itemsWritten
    );
    let needComma = !firstItem;

    console.log(
      `▶️  Starting (resume) from page ${page}, itemsWritten so far: ${itemsWritten}`
    );

    while (true) {
      const url = `${ODOO_BASE_URL}?apiKey=${encodeURIComponent(
        ODOO_API_KEY
      )}&page=${page}&limit=${limit}`;
      console.log(`🔄 Fetching page ${page}...`);

      const res = await fetchWithRetry(url, 3, 60000);
      const body = res.data || {};
      const items = Array.isArray(body.data) ? body.data : [];

      // If no items → we are done
      if (items.length === 0) {
        console.log("✅ No more items. Finalizing file.");
        finalizeOutputFile();
        writeState({ lastPage: page - 1, isClosed: true, itemsWritten });
        break;
      }

      for (const item of items) {
        if (needComma) fs.appendFileSync(OUTPUT_FILE, ",\n");
        fs.appendFileSync(OUTPUT_FILE, JSON.stringify(item));
        needComma = true;
        itemsWritten++;
      }

      // persist state after each page
      writeState({ lastPage: page, isClosed: false, itemsWritten });
      console.log(`✅ Page ${page} done. Total written: ${itemsWritten}`);

      page++;
      await sleep(150); // gentle throttle
    }

    return { itemsWritten, lastPage: page - 1, resumed: state.lastPage > 0 };
  } finally {
    removeLock();
  }
}

// ---- PUBLIC CONTROLLER HANDLERS ----

// Start the sync in background; returns immediately
exports.startOdooSync = async (req, res) => {
  try {
    res.json({ message: "Sync started in background", output: OUTPUT_FILE });

    // background
    crawlAll(1)
      .then((r) => console.log("🏁 Sync finished:", r))
      .catch((e) => console.error("❌ Sync error:", e.message));
  } catch (err) {
    console.error("❌ startOdooSync failed:", err.message);
    res
      .status(500)
      .json({ message: "Failed to start sync", error: err.message });
  }
};

// Optional: status endpoint so you can check progress
exports.odooSyncStatus = async (_req, res) => {
  try {
    const state = readState();
    res.json({
      running: hasLock(),
      state,
      output: OUTPUT_FILE,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to read status", error: err.message });
  }
};
