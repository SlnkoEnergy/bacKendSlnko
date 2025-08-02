// src/helpers/readCSV.js
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

function readCSV(po_number) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(__dirname, "..", "data", "po_old.csv");
    let found = null;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        if (row.po_number && row.po_number.trim() === po_number.trim()) {
          found = {
            po_number: row.po_number,
            po_basic: parseFloat(row.po_basic),
            gst: parseFloat(row.gst),
            po_value: parseFloat(row.po_value),
          };
        }
      })
      .on("end", () => resolve(found))
      .on("error", reject);
  });
}

module.exports = readCSV;
