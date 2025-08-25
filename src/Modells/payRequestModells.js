
const { default: mongoose } = require("mongoose");
const updateCurrentStatus = require("../utils/payRequestUpdate/updateCurrentStatus");


const StatusHistorySchema = new mongoose.Schema(
  {
    stage: {
      type: String,
      enum: [
        "Credit Pending",
        "Draft",
        "CAM",
        "Account",
        "Initial Account",
        "Final",
        "Trash Pending",
        "Rejected",
      ],
      required: true,
    },
    remarks: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);

const CreditHistorySchema = new mongoose.Schema(
  {
    credit_deadline: { type: Date },
    credit_remarks: { type: String, default: "" },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["Created", "Updated", "UTRUpdated", "UTRCleared"],
    },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UTRHistorySchema = new mongoose.Schema(
  {
    utr: { type: String, default: "" },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["Created", "Updated", "Cleared"],
      required: true,
    },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

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
    acc_number: { type: mongoose.Schema.Types.Mixed},
    branch: { type: String },
    // created_on: { type: String, default: Date.now },
    submitted_by: { type: String },
    utr_submitted_by: { type: String },

    credit: {
      credit_deadline: { type: Date },
      credit_status: { type: Boolean, default: false },
      credit_remarks: { type: String, default: "" },
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      credit_extension: { type: Boolean, default: false },
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
          "CAM",
          "Account",
          "Initial Account",
          "Final",
          "Trash Pending",
          "Rejected",
        ],
        default: "Draft",
      },
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      remarks: { type: String },
    },

    timers: {
      draft_started_at: { type: Date, default: Date.now },
      draft_frozen_at: { type: Date, default: null },
      trash_started_at: { type: Date, default: null },
    },

    status_history: [StatusHistorySchema],
    credit_history: [CreditHistorySchema],
    utr_history: [UTRHistorySchema],

    acc_match: { type: String },
    utr: { type: String },
    total_advance_paid: { type: String },
    other: { type: String },
    comment: { type: String },
  },
  { timestamps: true }
);


payRequestschema.pre("save", function (next) {
  updateCurrentStatus(this);
  next();
});

module.exports = mongoose.model("payRequest", payRequestschema);
