const mongoose = require("mongoose");
const updateCurrentStatus = require("../../utils/statusUpdateUtils/updateCurrentStatus");

const taskSchema = new mongoose.Schema(
  {
    taskCode: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    type:{
      type:String,
      enum:["internal", "helpdesk", "project"]
    },
    sub_type:{
      type:String,
      enum:["changes", "issue", "new feature"]
    },
    description: {
      type: String,
      required: true,
    },
    deadline: {
      type: Date,
    },
    project_id: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
    }],
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
        updatedAt: {
          type: Date,
          default: Date.now,
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

taskSchema.pre("save", function (next) {
  updateCurrentStatus(this, "status_history", "current_status");
  next();
});
module.exports = mongoose.model("Tasks", taskSchema);
