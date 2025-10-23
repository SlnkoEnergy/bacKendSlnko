const mongoose = require("mongoose");
const updateDprStatus = require("../utils/updateDprStatus");

const WorkStatusEnum = [
  "completed",
  "in progress",
  "pending",
  "ideal",
  "draft",
];
const AssignedStatusEnum = ["Assigned", "Removed", "Partial"];

const EngineerWorkSchema = new mongoose.Schema(
  {
    activity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "activities",
      required: true,
    },
    assigned_engineer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    work_completion: { type: Number, default: 0, min: 0, max: 100 },
    work_status: { type: String, enum: WorkStatusEnum, default: "draft" },
    remarks: { type: String },
    assigned_status: {
      type: String,
      enum: AssignedStatusEnum,
      default: "Assigned",
    },
  },
  { timestamps: true }
);

const StatusEntrySchema = new mongoose.Schema(
  {
    updated_at: { type: Date, default: Date.now },
    phase: { type: String, enum: ["phase_1", "phase_2"] },
    activity_id: { type: mongoose.Schema.Types.ObjectId, ref: "activities" },
    assigned_engineer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assigned_status: { type: String, enum: AssignedStatusEnum },
    work_status: { type: String, enum: WorkStatusEnum },
    work_completion: { type: Number, min: 0, max: 100 },
    remarks: String,
  },
  { _id: false }
);

const DprActivitiesSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
      required: true,
      index: true,
    },

    phase_1_engineers: [EngineerWorkSchema],
    phase_2_engineers: [EngineerWorkSchema],

    current_status: {
      type: [StatusEntrySchema],
      default: [],
    },

    status_history: {
      type: [StatusEntrySchema],
      default: [],
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      // required: true,
    },
  },
  { timestamps: true }
);


DprActivitiesSchema.pre("save", async function (next) {
  updateDprStatus(this, "status_history", "current_status");
  next();
});

module.exports = mongoose.model("dpractivities", DprActivitiesSchema);
