const mongoose = require("mongoose");
const updateCurrentStatus = require("../../utils/statusUpdateUtils/updateCurrentStatus");

const dprTaskSchema = new mongoose.Schema(
  {
    dpr_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dpr",
    },
    name: { type: String, required: true },
    description: { type: String },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    logs: [
      {
        status: {
          type: String,
          enum:["completed", "in progress", "pending", "ideal", "draft"]
        },
        remarks: { type: String },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        quantity: { type: Number, required: true },
        updatedAt: { type: Date, default: Date.now },
        assigned_to: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    current_log: {
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      remarks: { type: String },
      quantity: { type: Number, required: true },
      updatedAt: { type: Date, default: Date.now },
      status: {
        type: String,
        enum:["completed", "in progress", "pending", "ideal", "draft"]
      },
      assigned_to: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
  },
  { timestamps: true }
);

dprTaskSchema.pre("save", async function (next) {
  updateCurrentStatus(this, "logs", "current_log");
  next();
});
module.exports = mongoose.model("DprTask", dprTaskSchema);
