const { default: mongoose } = require("mongoose");

const purchaseOrderSchema = new mongoose.Schema(
  {
    p_id: {
      type: Number,
    },
    offer_Id:{
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
       default:" ",
    },
    po_value: {
      type: String,
    },
    total_advance_paid: {
      type: String,
    },
    po_balance: {
      type: String,
    },
    vendor: {
      type: String,
    },
    partial_billing: {
      type: String,
    },

    amount_paid: {
      type: String,
    },
    comment: {
      type: String,
    },
    updated_on: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("purchaseOrder", purchaseOrderSchema);
