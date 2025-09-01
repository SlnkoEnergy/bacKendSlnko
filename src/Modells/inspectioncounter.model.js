const mongoose = require("mongoose");

const inspectionCounterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    seq: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("inspectioncounter", inspectionCounterSchema);
