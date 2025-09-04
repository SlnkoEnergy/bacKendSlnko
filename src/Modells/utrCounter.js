
const mongoose = require("mongoose");

const utrCounterSchema = new mongoose.Schema({
   p_id: { type: Number, required: true },
   count: { type: Number, default: 0 },
  lastDigit: { type: Number, default: 0 },
});

utrCounterSchema.index({ p_id: 1 }, { unique: true });

const utrCounter = mongoose.model('utrCounter', utrCounterSchema);

module.exports = utrCounter;
