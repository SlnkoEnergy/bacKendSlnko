const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
      required: true,
    },
    filename: {
      type: String,
    },
    fileurl: {
      type: String,
    },
    fileType: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Documents", documentSchema);
