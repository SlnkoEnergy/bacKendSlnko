const mongoose = require("mongoose");
const updateCurrentStatus = require("../utils/statusUpdateUtils/updateCurrentStatus");

const dprTaskSchema = new mongoose.Schema(
  {
    dpr_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dpr",
      required: true,
    },
    name: { type: String, required: true },
    description: { type: String },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    deadline: { type: Date, required: true },
    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    logs: [
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
        quantity: { type: Number, required: true },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    current_log: {
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      remarks: { type: String },
      quantity: { type: Number},
      updatedAt: { type: Date, default: Date.now },
      status: {
        type: String,
        enum: ["completed", "in progress", "pending", "ideal", "draft"],
      },
    },
    createdBy:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }
  },
  { timestamps: true }
);

dprTaskSchema.pre("save", async function (next) {
  updateCurrentStatus(this, "logs", "current_log");
  next();
});
module.exports = mongoose.model("DprTask", dprTaskSchema);
