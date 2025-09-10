const mongoose = require("mongoose");
const updateStatus = require("../utils/updatestatus.utils");
const updateSubtaskStatus = require("../utils/updatesubtaskstatus.utils");

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
    type: {
      type: String,
      enum: ["internal", "helpdesk", "project"],
    },
    sub_type: {
      type: String,
      enum: ["changes", "issue", "new feature"],
    },
    description: {
      type: String,
      required: true,
    },
    deadline: {
      type: Date,
    },
    internal_deadline: {
      type: Date,
    },
    project_id: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "projectDetail",
      },
    ],
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
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
    comments: [
      {
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
    attachments: [
      {
        name: {
          type: String,
        },
        url: {
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
    status_history: [
      {
        status: {
          type: String,
          enum: ["completed", "pending", "in progress", "draft", "cancelled"],
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
        enum: ["completed", "pending", "in progress", "draft", "cancelled"],
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
    sub_tasks: [
      {
        assigned_to: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        }],
        deadline: {
          type: Date,
        },
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

taskSchema.pre("save", function (next) {
  updateStatus(this, "pending");
  updateSubtaskStatus(this);
  next();
});

module.exports = mongoose.model("Tasks", taskSchema);
