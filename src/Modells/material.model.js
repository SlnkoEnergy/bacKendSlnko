const mongoose = require("mongoose");

const materialSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MaterialCategory",
      required: true,
    },
    sku_code:{
      type:String,
      required: true
    },
    data: [
      {
        _id: false,
        name: { type: String },
        values: [
          {
            _id: false,
            input_values: { type: String },
          },
        ],
      },
    ],
    is_available: {
      type: Boolean,
      default: false,
      required: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Material", materialSchema);
