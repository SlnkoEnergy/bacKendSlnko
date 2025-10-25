const Counter = require("../models/templatecodecounter.model");

async function nextTemplateId() {
  const name = "template_counter";

  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seq = String(counter.seq).padStart(4, "0");

  return `Temp/${seq}`;
}

module.exports = { nextTemplateId };
