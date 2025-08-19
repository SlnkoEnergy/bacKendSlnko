const mongoose = require("mongoose");

const purchaseRequestSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
    },
    items: [
      {
        item_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MaterialCategory",
        },
        product_name: {
          type: String,
        },
        product_make: {
          type: String,
        },
        quantity: {
          type: String,
        },
        uom: {
          type: String,
        },
        cost: {
          type: String,
        },
        gst: {
          type: String,
        },
        status: {
          type: String,
        },
      },
    ],
    status: {
      type: String,
    },
    pr_no: {
      type: String,
    },
    delivery_address: {
      type: String,
    },
    description: {
      type: String,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PurchaseRequest", purchaseRequestSchema);
