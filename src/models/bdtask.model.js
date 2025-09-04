const { default: mongoose } = require("mongoose");
const taskCurrentStatus = require("../utils/taskCurrentStatus");

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["completed", "in progress", "pending"],
    },
    remarks: {
      type: String,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    lead_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref:"bdleads"
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    type: {
      type: String,
      enum: ["meeting", "call", "sms", "email", "todo"],
    },
    status_history: [statusHistorySchema],
    current_status: {
      type: String,
      enum: ["completed", "in progress", "pending"],
    },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
    },
    is_viewed:[{
      type:mongoose.Schema.Types.ObjectId,
    }],
    assigned_to: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    deadline: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
    },
  },
  { timestamps: true }
);

taskSchema.pre("save", function (next) {
  taskCurrentStatus(this, "status_history", "current_status");
  next();
});

module.exports = mongoose.model("BDtask", taskSchema);
