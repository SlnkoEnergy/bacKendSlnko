const mongoose = require("mongoose");

const billSchema = new mongoose.Schema(
  {
    id: {
      type: String,
    },
    po_number: {
      type: String,
    },
    item: [
      {
        category_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MaterialCategory",
        },
        product_name: {
          type: String,
        },
        product_make: {
          type: String,
        },
        uom: {
          type: String,
        },
        quantity: {
          type: String,
        },
        bill_value: {
          type: String,
        },
        gst_percent: {
          type: String,
        },
      },
    ],
    bill_number: {
      type: String,
    },
    bill_date: {
      type: String,
    },
    bill_value: {
      type: Number,
    },
    gst: {
      type: Number,
    },
    type: {
      type: String,
    },
    status: {
      type: String,
    },
    description: {
      type: String,
    },
    submitted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    created_on: {
      type: String,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("biilDetail", billSchema);
