// models/projectActivities.model.js
const mongoose = require("mongoose");
const updateStatus = require("../utils/updatestatus.utils");

const StatusEnum = ["not started", "in progress", "completed"];
const LinkType = ["FS", "SS", "FF", "SF"];

const projectActivitySchema = new mongoose.Schema(
  {
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: "projectDetail" },
    name: String,
    description: String,
    template_code: { type: String, unique: true, index: true },
    activities: [
      {
        activity_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "activities",
          required: true,
        },
        order: Number,
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
              ref: "activities",
            },
            type: { type: String, enum: LinkType, default: "FS" },
            lag: { type: Number, default: 0 },
          },
        ],
        successors: [
          {
            activity_id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "activities",
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
        products: [
          {
            product_id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Material",
            },
            required_quantity: {
              quantity_formula: { type: String },
              quantity_unit: { type: String },
            },
          },
        ],
        dependency: [
          {
            model: { type: String },
            model_id: {
              type: mongoose.Schema.Types.ObjectId,
              refPath: "dependency.model",
              required: true,
            },
            model_id_name: { type: String },
            updatedAt: { type: Date, default: Date.now },
            updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            status_history: [
              {
                status: {
                  type: String,
                  enum: [
                    "approved",
                    "approval_pending",
                    "rejected",
                    "allowed",
                    "not allowed",
                  ],
                },
                remarks: { type: String },
                updatedAt: { type: Date, default: Date.now },
                user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
              },
            ],
            current_status: {
              status: {
                type: String,
                enum: [
                  "approved",
                  "approval_pending",
                  "rejected",
                  "allowed",
                  "not allowed",
                ],
              },
              remarks: { type: String },
              updatedAt: { type: Date, default: Date.now },
              user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            },
          },
        ],
        resources: [
          {
            type: {
              type: String,
              enum: [
                "surveyor",
                "civil engineer",
                "civil i&c",
                "electric engineer",
                "electric i&c",
                "soil testing team",
                "tline engineer",
                "tline subcontractor",
              ],
            },
            number: {
              type: Number,
            },
          },
        ],
      },
    ],
    status: { type: String, enum: ["template", "project"] },
    status_history: [
      {
        status: {
          type: String,
          enum: ["freeze", "unfreeze"],
        },
        remarks: {
          type: String,
        },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    current_status: {
      status: {
        type: String,
        enum: ["freeze", "unfreeze"],
      },
      remarks: {
        type: String,
      },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      updatedAt: { type: Date, default: Date.now },
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

projectActivitySchema.pre("save", function (next) {
  if (Array.isArray(this.activities)) {
    this.activities.forEach((activity) => {
      updateStatus(activity, "not started");
      if (Array.isArray(activity.dependency)) {
        activity.dependency.forEach((dep) => updateStatus(dep, "not allowed"));
      }
    });

    let idx = 0;
    this.activities.forEach((a) => {
      if (a.order === undefined || a.order === null || Number.isNaN(a.order)) {
        a.order = idx;
      }
      idx++;
    });
  }
  updateStatus(this, "unfreeze");
  next();
});

module.exports = mongoose.model("projectActivities", projectActivitySchema);
