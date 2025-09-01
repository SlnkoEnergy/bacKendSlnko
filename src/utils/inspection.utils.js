const Inspection = require("../Modells/inspectioncounter.model");
function indianFYString(date = new Date()) {
  const d = new Date(date);
  const fyStartYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const yy = String(fyStartYear).slice(-2);
  const yyNext = String(fyStartYear + 1).slice(-2);
  return `${yy}-${yyNext}`;
}
async function nextInspectionCode() {
  const fy = indianFYString();
  const name = `Inspection_FY_${fy}`;

  const counter = await Inspection.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seq = String(counter.seq).padStart(4, "0");
  return `INS/${fy}/${seq}`;
}

module.exports = { nextInspectionCode };
