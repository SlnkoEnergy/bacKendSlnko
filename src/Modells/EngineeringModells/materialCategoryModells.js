const mongoose = require("mongoose");
const materCatergorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    fields: [
      {
        name: { type: String, required: true },
        type: { type: String, required: true },
        required: { type: Boolean, default: false },
        placeholder: { type: String },
        key: { type: String }, // For select fields
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
module.exports = mongoose.model("MaterialCategory", materCatergorySchema);
