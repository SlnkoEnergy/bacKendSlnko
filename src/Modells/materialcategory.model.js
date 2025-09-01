const mongoose = require("mongoose");
const materCatergorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, enum: ["supply", "execution"], required: true },
    category_code: { type: String, required: true },
    product_count: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["active", "inactive"],
    },
    order: { type: Number },
    fields: [
      {
        _id: false,
        name: { type: String, required: true },
        input_type: { type: String, required: true },
        required: { type: Boolean, default: false },
        placeholder: { type: String },
        key: { type: String },
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
module.exports = mongoose.model("MaterialCategory", materCatergorySchema);
