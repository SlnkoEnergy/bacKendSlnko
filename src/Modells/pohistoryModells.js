const mongoose = require("mongoose");
const pohistoryschema = new mongoose.Schema({
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
  item: [
    {
      category: {
        type: mongoose.Schema.Types.Mixed,
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
      cost: {
        type: String,
      },
      gst_percent: {
        type: String,
      },
    },
  ],
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
  po_basic: {
    type: String,
  },
  gst: { type: String },
});
module.exports = mongoose.model("pohistory", pohistoryschema);
