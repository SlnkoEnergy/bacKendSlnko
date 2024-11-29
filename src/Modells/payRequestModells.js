const { default: mongoose } = require("mongoose");

const payRequestschema = new mongoose.Schema(
  {
    id: { type: String },
    p_id: { type: String },
    pay_id: { type: String },
    pay_type: { type: String },
    amount_paid: { type: String },
    amt_for_customer: { type: String },
    dbt_date: { type: String },
    paid_for: { type: String },
    vendor: { type: String },
    po_number: { type: String },
    pay_mode: {
      type: String,
    },
    benificiary: { type: String },
    acc_number: { type: String },
    branch: { type: String },
    created_on: { type: String, default: Date.now },
    submitted_by: { type: String },
    approved: { type: String },
    disable: { type: String },
    acc_match: { type: String },
    utr: { type: Number },
    total_balance: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("payRequest", payRequestschema);
