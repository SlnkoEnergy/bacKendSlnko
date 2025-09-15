const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    dependancy: [
      {
        model: {
          type: String,
        },
        model_id: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: "activities.dependancy.model",
        },
        departments: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "departments",
        },
      },
    ],
    links: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "activities",
      },
    ],
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("activities", activitySchema);
