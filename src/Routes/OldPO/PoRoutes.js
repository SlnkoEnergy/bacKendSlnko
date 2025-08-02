const express = require("express");
const router = express.Router();
const fixPOValuesFromCSV = require("../../helpers/PoFromCsv");
const PoModel = require("../../Modells/purchaseOrderModells");
const readCSV = require("../../helpers/readCSV");

router.get("/po-old", async (req, res) => {
  const poNumber = req.query.po_number;
  if (!poNumber) return res.status(400).json({ message: "Missing po_number" });

  try {
    const record = await readCSV(poNumber);
    if (!record) {
      return res.status(404).json({ message: "PO number not found in CSV" });
    }
    res.json(record);
  } catch (error) {
    console.error("Error reading PO fields:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
