const mongoose = require("mongoose");

const logisticSchema = new mongoose.Schema(
  {
    po_id: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "purchaseOrder",
        required: true,
      },
    ],
    logistic_code: {
      type: String,
      uniuqe: true,
      index: true,
      required: true,
    },
    attachment_url: { type: String },
    vehicle_number: { type: String, required: true },
    driver_number: { type: String, required: true },
    total_ton: { type: String, required: true },
    total_transport_po_value: { type: String, required: true },
    description: { type: String },
    items: [
      {
        material_po: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "purchaseOrder",
        },
        category_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MaterialCategory",
        },
        product_name: { type: String },
        product_make: { type: String },
        quantity_requested: { type: String },
        quantity_po: { type: String },
        weight: { type: String },
      },
    ],
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Logistic", logisticSchema);
