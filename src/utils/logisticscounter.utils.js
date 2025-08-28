const Counter = require("../Modells/logisticscodecounter.model");
function indianFYString(date = new Date()) {
  const d = new Date(date);
  const fyStartYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; // Apr = 3
  const yy = String(fyStartYear).slice(-2);
  const yyNext = String(fyStartYear + 1).slice(-2);
  return `${yy}-${yyNext}`; 
}
async function nextLogisticCode() {
  const fy = indianFYString();
  const name = `logistic_FY_${fy}`;

  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seq = String(counter.seq).padStart(4, "0");
  return `LG/${fy}/${seq}`;
}

module.exports = { nextLogisticCode };
