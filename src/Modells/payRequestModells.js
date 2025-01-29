const { default: mongoose } = require("mongoose");

const payRequestschema = new mongoose.Schema(
  {
    id: { type: String },
    p_id: { type: Number },
    pay_id: { type: String },
    pay_type: { type: String },
    amount_paid: { type: String },
    amt_for_customer: { type: String },
    dbt_date: { type: String },
    paid_for: { type: String },
    vendor: { type: String },
    po_number: { type: String },
    po_value: { type: String },
    po_balance: { type: String },

    pay_mode: {
      type: String,
    },
    paid_to: {
      type: String,
    },
    ifsc: { type: String },
    benificiary: { type: String },
    acc_number: { type: String },
    branch: { type: String },
    created_on: { type: String, default: Date.now },
    submitted_by: { type: String },
    approved: { type: String,enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending'},
    disable: { type: String },
    acc_match: { type: String },
    utr: { type: String },
    total_advance_paid: { type: String },
    other: { type: String },
    comment: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("payRequest", payRequestschema);

