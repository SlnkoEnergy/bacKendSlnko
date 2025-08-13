const { default: mongoose } = require("mongoose");
const updateCurrentStatus = require("../utils/payRequestUpdate/updateCurrentStatus");

const payRequestschema = new mongoose.Schema(
  {
    p_id: { type: Number },
    pay_id: { type: String },
    cr_id: { type: String },
    pay_type: { type: String },
    amount_paid: { type: String },
    amt_for_customer: { type: String },
    dbt_date: { type: String },
    paid_for: { type: String },
    vendor: { type: String },
    po_number: { type: String },
    po_value: { type: String },
    ifsc: { type: String },
    benificiary: { type: String },
    acc_number: { type: mongoose.Schema.Types.Mixed },
    branch: { type: String },
    created_on: { type: String, default: Date.now },
    submitted_by: { type: String },
    utr_submitted_by: { type: String, default: " " },

    credit: {
      credit_deadline: { type: Date },
      credit_status: { type: Boolean, default: false },
      credit_remarks: { type: String, default: "" },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },

    approved: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },

    approval_status: {
      stage: {
        type: String,
        enum: [
          "Credit Pending",
          "Draft",
          "SCM",
          "CAM",
          "Account",
          "Final",
          "Trash Pending",
          "Rejected",
        ],
        default: "Draft",
      },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      remarks: { type: String },
    },

    timers: {
      draft_started_at: { type: Date, default: Date.now },
      draft_frozen_at: { type: Date, default: Date.now },
      trash_started_at: { type: Date, default: null },
    },

    status_history: [
      {
        stage: {
          type: String,
          enum: [
            "Credit Pending",
            "Draft",
            "SCM",
            "CAM",
            "Account",
            "Final",
            "Trash Pending",
            "Rejected",
          ],
        },
        remarks: {
          type: String,
          default: "",
        },
        timestamp: { type: Date, default: Date.now },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],

    credit_history: [
      {
        credit_deadline: { type: Date },
        credit_remarks: { type: String, default: "" },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: { type: String, enum: ["Created", "Updated"] },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    acc_match: { type: String },
    utr: { type: String },
    other: { type: String },
    comment: { type: String },
  },
  { timestamps: true }
);

payRequestschema.pre("save", function (next) {
  updateCurrentStatus(this, "status_history", "approval_status");
  next();
});

module.exports = mongoose.model("payRequest", payRequestschema);
