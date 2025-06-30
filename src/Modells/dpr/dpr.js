const mongoose = require("mongoose");
const updateCurrentStatus = require("../../utils/statusUpdateUtils/updateCurrentStatus");

const dprSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
    },
    status_history: [
      {
        status: {
          type: String,
        },
        remarks: { type: String },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    current_status: {
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      remarks: { type: String },
      status: {
        type: String,
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

const Dpr = mongoose.model("Dpr", dprSchema);
