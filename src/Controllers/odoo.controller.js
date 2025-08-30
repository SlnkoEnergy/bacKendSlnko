const materialcategoryModel = require("../Modells/materialcategory.model");
const purchaseorderModel = require("../Modells/purchaseorder.model");
const { bulkUpsertOdooPOs } = require("../utils/odoo.utils");
const fs = require("fs");
const path = require("path");

const odoo = async (req, res) => {
  try {
    const filePath = path.join(__dirname, "../data/odoo_pos.json");

    const raw = fs.readFileSync(filePath, "utf8");
    const odooPOs = JSON.parse(raw);

    if (!Array.isArray(odooPOs)) {
      return res
        .status(400)
        .json({ success: false, message: "File does not contain an array of POs" });
    }

    const results = await bulkUpsertOdooPOs(
      odooPOs,
      purchaseorderModel,
      materialcategoryModel
    );

    res.json({ success: true, results });
  } catch (err) {
    console.error("Error processing Odoo file:", err);
    res.status(500).json({ success: false, message: "Internal error" });
  }
};

module.exports = { odoo };