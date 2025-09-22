const mongoose = require("mongoose");

const approvalSchema = new mongoose.Schema(
  {
    model_name: {
      type: String,
      required: true,
    },
    model_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "model_name",
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
    },
  },
  { timestamps: true }
);

approvalSchema.post("save", function (next) {
  updateApprover(this);
  next();
});

module.exports = mongoose.model("Approvals", approvalSchema);
