const mongoose = require("mongoose");
const updateStatus = require("../utils/updatestatus.utils");

const projectActivitySchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetails",
      required: true,
    },
    activities: [
      {
        activity_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "activities",
          required: true,
        },
        lag: {
          type: Number,
          default: 0,
        },
        start_date: {
          type: Date,
        },
        end_date: {
          type: Date,
        },
        status_history: [
          {
            status: {
              type: String,
              enum: ["not started", "in progress", "completed"],
              default: "not started",
            },
            updated_at: {
              type: Date,
              default: Date.now,
            },
            updated_by: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
            remarks: {
              type: String,
            },
          },
        ],
        current_status: {
          status: {
            type: String,
            enum: ["not started", "in progress", "completed"],
            default: "not started",
          },
          updated_at: {
            type: Date,
            default: Date.now,
          },
          updated_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          remarks: {
            type: String,
          },
        },
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
  updateStatus(this.activities, "not started");
  next();
});

module.exports = mongoose.model("projectActivities", projectActivitySchema);
