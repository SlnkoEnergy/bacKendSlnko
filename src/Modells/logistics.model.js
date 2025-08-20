const mongoose = require("mongoose");

const logisticSchema = new mongoose.Schema(
  {
    po_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "purchaseOrder",
      required: true,
    },
    attachment_url: { type: String },
    vehicle_number: { type: String, required: true },
    driver_number: { type: String, required: true },
    total_ton: { type: String, required: true },
    description: { type: String },
    items: [
      {
        category_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MaterialCategory",
        },
        product_name: { type: String },
        product_make: { type: String },
        quantity_requested: { type: String },
        quantity_loaded: { type: String },
        quantity_received: { type: String },
        ton: { type: String },
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
