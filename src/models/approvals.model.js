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
    },
  },
  { timestamps: true }
);

approvalSchema.post("save", function (next) {
  updateApprover(this);
  if(this.dependency_id && this.activity_id){
    updateProjectActivity(this, this.model_id,this.dependency_id, this.activity_id, remarks, );
  }
  next();
});

module.exports = mongoose.model("Approvals", approvalSchema);
