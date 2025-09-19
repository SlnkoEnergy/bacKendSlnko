const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true , indecx: true },
  seq: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("TemplateCounter", counterSchema);
