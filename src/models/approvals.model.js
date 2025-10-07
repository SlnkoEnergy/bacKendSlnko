const mongoose = require("mongoose");
const updateProjectActivityFromApproval = require("../utils/updateProjectActivity");
const updateApprover = require("../utils/updateapprover.utils");

const approvalSchema = new mongoose.Schema(
  {
    approval_code: {
      type: String,
      required: true,
      unique: true,
    },
    model_name: {
      type: String,
      required: true,
    },
    model_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "model_name",
    },
    activity_id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    dependency_id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    approvers: [
      {
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        sequence: {
          type: Number,
        },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        remarks: {
          type: String,
        },
      },
    ],
    current_approver: {
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      sequence: {
        type: Number,
      },
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
      },
      remarks: { type: String },
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

approvalSchema.pre("save", function (next) {
  updateApprover(this);
  next();
});
approvalSchema.post("save", function (doc) {
  if (doc.dependency_id && doc.activity_id) {
    updateProjectActivityFromApproval(
      doc,
      doc.model_id,
      doc.activity_id,
      doc.dependency_id
    );
  }
});

module.exports = mongoose.model("Approvals", approvalSchema);
