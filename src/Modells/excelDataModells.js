const mongoose = require("mongoose");

const excelSchema = new mongoose.Schema({
    id: {type: String},
    p_id: {
        type: String,
    },
    pay_id: {
        type: String,
    },
    pay_type: {
        type: String,
    },
    amount_paid: {
        type: String,
    },
    amt_for_customer: {
        type: String,
    },
    dbt_date: {
        type: String,
    },
    paid_for: {
        type: String,
    },
    vendor: {
        type: String,
    },
    po_number: {
        type: String,
    },
    po_value: {
        type: String,
    },
    po_balance: {
        type: String,
    },
    pay_mode: {
        type: String,
    },
    paid_to: {
        type: String,
    },
    ifsc: {
        type: String,
    },
    benificiary: {
        type: String,
    },
    acc_number: {
        type: String,
    },
    branch: {
        type: String,
    },
    created_on: {
        type: String,
    },
    submitted_by: {
        type: String,
    },
    approved: {
        type: String,
    },
    disable: {
        type: String,
    },
    acc_match: {
        type: String,
    },
    utr: {
        type: String,
    },
    total_advance_paid: {
        type: String,
    },
    other: {
        type: String,
    },
    comment: {
        type: String,
    },
    status: {
        type: String,
        default: "",
    }

}, { timestamps: true });

module.exports = mongoose.model("excelData", excelSchema);