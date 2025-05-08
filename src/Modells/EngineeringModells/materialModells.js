const mongoose = require("mongoose");
const materialSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MaterialCategory",
      required: true,
    },
    data: [
      {
        name: { type: String, required: true },
        value: { type: String, required: true },
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Material", materialSchema);
