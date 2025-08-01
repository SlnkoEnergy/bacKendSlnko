const readCSV = require("./readCSV");
const PoModel = require("../Modells/purchaseOrderModells");

const fixPOValuesFromCSV = async () => {
  const csvData = await readCSV("po_old.csv");
  let updated = 0;
  let unmatched = [];

  for (const row of csvData) {
    const { po_number, po_basic, gst, po_value } = row;

    if (!po_number || po_basic == null || gst == null) continue;

    const parsedPoBasic = parseFloat(po_basic);
    const parsedGst = parseFloat(gst);
    const parsedPoValueFromCSV = parseFloat(po_value);
    const calculatedPoValue = parsedPoBasic + parsedGst;

    if (
      isNaN(parsedPoBasic) ||
      isNaN(parsedGst) ||
      isNaN(parsedPoValueFromCSV)
    ) {
      unmatched.push({ po_number, reason: "Invalid number format" });
      continue;
    }

    if (Math.abs(parsedPoValueFromCSV - calculatedPoValue) > 0.01) {
      console.warn(
        `⚠️ CSV mismatch in PO: ${po_number} — CSV po_value (${parsedPoValueFromCSV}) != basic+gst (${calculatedPoValue})`
      );
    }

    const existing = await PoModel.findOne({ po_number });

    if (!existing) {
      unmatched.push({ po_number, reason: "Not found in DB" });
      continue;
    }

    const needsFix =
      existing.po_basic !== parsedPoBasic ||
      existing.gst !== parsedGst ||
      Math.abs((existing.po_value || 0) - parsedPoValueFromCSV) > 0.01;

    if (needsFix) {
      await PoModel.updateOne(
        { _id: existing._id },
        {
          $set: {
            po_basic: parsedPoBasic,
            gst: parsedGst,
            po_value: parsedPoValueFromCSV,
          },
        }
      );
      updated++;
    }
  }

  return { updated, unmatched };
};

module.exports = fixPOValuesFromCSV;
