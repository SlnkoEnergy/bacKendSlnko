const { default: mongoose } = require("mongoose");

const purchaseOrderSchema = new mongoose.Schema(
  {
    p_id: {
      type: String,
    },
    offer_Id: {
      type: String,
    },

    po_number: {
      type: String,
    },
    date: {
      type: String,
    },
    item: {
      type: String,
    },
    other: {
      type: String,
      default: " ",
    },
    po_value: {
      type: Number,
    },
    total_advance_paid: {
      type: String,
    },
    po_balance: {
      type: Number,
    },
    vendor: {
      type: String,
    },
    partial_billing: {
      type: String,
    },

    amount_paid: {
      type: Number,
    },
    comment: {
      type: String,
    },
    updated_on: {
      type: String,
    },
    submitted_By: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("purchaseOrder", purchaseOrderSchema);
