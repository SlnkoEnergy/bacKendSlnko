const mongoose = require("mongoose");
const updateStatus = require("../utils/updatestatus.utils");

const loanSchema = new mongoose.Schema({
  project_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "projectDetail",
  },
  documents: [
    {
      filename: {
        type: String,
      },
      fileurl: {
        type: String,
      },
      fileType: {
        type: String,
      },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      updatedAt: {
        type: Date,
        default: Date.now(),
      },
    },
  ],
  banking_details: [
    {
      name: {
        type: String,
      },
      branch: {
        type: String,
      },
      state:{
        type: String
      },
      ifsc_code: {
        type: String,
      },
    },
  ],
  comments: [
    {
      remarks: {
        type: String,
      },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      updatedAt:{
        type: Date,
        default: Date.now()
      }
    },
  ],
  status_history: [
    {
      status: {
        type: String,
        enum: [
          "submitted",
          "document pending",
          "under process bank",
          "sanctioned",
          "disbursed",
        ],
      },
      remarks: {
        type: String,
      },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      updatedAt: {
        type: Date,
        default: Date.now(),
      },
    },
  ],
  current_status: {
    status: {
      type: String,
      enum: [
        "submitted",
        "document pending",
        "under process bank",
        "sanctioned",
        "disbursed",
      ],
    },
    remarks: {
      type: String,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedAt: {
      type: Date,
      default: Date.now(),
    },
  },
  timelines: {
    expected_disbursement_date: {
      type: Date,
    },
    expected_sanctioned_date: {
      type: Date,
    },
    actual_disbursement_date: {
      type: Date,
    },
    actual_sanctioned_date: {
      type: Date,
    },
  },
});

loanSchema.pre("save", function (next) {
  updateStatus(this, "submitted");
  next();
});

module.exports = mongoose.model("loan", loanSchema);
