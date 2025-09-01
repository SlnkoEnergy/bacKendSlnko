const express = require("express");
const {
  startOdooSync,
  odooSyncStatus,
} = require("../controllers/odoo_final.controller");

const router = express.Router();

// Kick off background sync (immediate 200 response)
router.post("/sync/odoo/start", startOdooSync);

// Check current progress
router.get("/sync/odoo/status", odooSyncStatus);

module.exports = router;
