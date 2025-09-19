const Counter = require("../models/templatecodecounter.model"); // create a separate counter model if needed

async function nextTemplateId() {
  const name = "template_counter";

  // Find the counter doc and increment seq
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true } // create if not exists
  );

  // Pad the number with leading zeros
  const seq = String(counter.seq).padStart(4, "0");

  // Return final template id
  return `Temp/${seq}`;
}

module.exports = { nextTemplateId };
