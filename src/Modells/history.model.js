const mongoose = require("mongoose");

const ChangeSchema = new mongoose.Schema(
  {
    path: { type: String, required: true },
    label: String,
    from: mongoose.Schema.Types.Mixed,
    to: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);
const attachementSchema = new mongoose.Schema(
  {
    name: String,
    url: String,
  },
  { _id: false }
);
const historySchema = new mongoose.Schema(
  {
    subject_type: { type: String, required: true },
    subject_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    event_type: {
      type: String,
      enum: [
        "note",
        "create",
        "update",
        "status_change",
        "assign",
        "attachment",
      ],
      required: true,
    },
    message: { type: String, default: "" },
    changes: [ChangeSchema],
    attachments: [attachementSchema],
    createdBy: {
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("History", historySchema);
