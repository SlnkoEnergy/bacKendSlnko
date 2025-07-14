const mongoose = require("mongoose");
const updateCurrentStatus = require("../../utils/statusUpdateUtils/updateCurrentStatus");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    deadline: {
      type: Date,
    },
    assigned_to: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    priority: {
      type: String,
      enum: ["1", "2", "3"],
    },
    status_history: [
      {
        status: {
          type: String,
          enum: ["completed", "pending", "in progress", "draft"],
        },
        remarks: {
          type: String,
        },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    current_status: {
      status: {
        type: String,
        enum: ["completed", "pending", "in progress", "draft"],
      },
      remarks: {
        type: String,
      },
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

taskSchema.pre("save", function(next){
    updateCurrentStatus(this, "status_history", "current_status");
    next();
})
module.exports = mongoose.model("Tasks", taskSchema);
