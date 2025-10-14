const mongoose = require("mongoose");
const updateCurrentStatus = require("../utils/statusUpdateUtils/updateCurrentStatus");

const dprSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
    },
    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status_history: [
      {
        status: {
          type: String,
          enum: ["completed", "in progress", "pending", "ideal", "draft"],
        },
        remarks: { type: String },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    current_status: {
      status: {
        type: String,
        enum: ["completed", "in progress", "pending", "ideal", "draft"],
      },
      remarks: { type: String },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

dprSchema.pre("save", async function (next) {
  updateCurrentStatus(this, "status_history", "current_status");
  next();
});

module.exports = mongoose.model("Dpr", dprSchema);
