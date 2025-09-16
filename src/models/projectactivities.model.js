const mongoose = require("mongoose");
const updateStatus = require("../utils/updatestatus.utils");


const StatusEnum = ["not started", "in progress", "completed"];
const LinkType = ["FS", "SS", "FF", "SF"];

const projectActivitySchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    master_activity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActivityMaster",
      required: true,
    },
    planned_start: Date,
    planned_finish: Date,
    actual_start: Date,
    actual_finish: Date,
    duration: Number,
    percent_complete: { type: Number, min: 0, max: 100, default: 0 },
    predecessors: [
      {
        activity_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ProjectActivity",
        },
        type: { type: String, enum: LinkType, default: "FS" },
        lag: { type: Number, default: 0 },
      },
    ],
    successors: [
      {
        activity_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ProjectActivity",
        },
        type: { type: String, enum: LinkType, default: "FS" },
        lag: { type: Number, default: 0 },
      },
    ],
    current_status: {
      status: { type: String, enum: StatusEnum, default: "not started" },
      updated_at: { type: Date, default: Date.now },
      updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      remarks: String,
    },
    status_history: [
      {
        status: { type: String, enum: StatusEnum },
        updated_at: { type: Date, default: Date.now },
        updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        remarks: String,
      },
    ],
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

projectActivitySchema.pre("save", function (next) {
  updateStatus(this, "not started");
  next();
});

module.exports = mongoose.model("projectActivities", projectActivitySchema);
