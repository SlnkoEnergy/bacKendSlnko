const mongoose = require("mongoose");
const updateStatus = require("../utils/updatestatus.utils");

const VariableSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, default: "" },
    type: { type: String, default: "string" },
    sample: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const emailTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    identifier: { type: String, required: true, unique: true },
    name_to_send: [{ type: String }],
    to: { type: String, required: true },
    cc: [{ type: String }],
    bcc: [{ type: String }],
    from: [{ type: String, required: true }],
    subject: { type: String, required: true },
    body: { type: String, required: true },
    bodyFormat: { type: String, enum: ["html", "text"], default: "html" },
    placeholders: [{ type: String }],
    variables: [VariableSchema],
    variablesSchema: { type: mongoose.Schema.Types.Mixed },
    attachments: [
      {
        filename: String,
        fileUrl: String,
        fileType: String,
      },
    ],
    tags: [{ type: String, required: true }],
    status_history: [
      {
        status: { type: String, enum: ["inactive", "active", "trash"] },
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        remarks: { type: String },
        created_at: { type: Date, default: Date.now },
      },
    ],
    current_status: {
      status: {
        type: String,
        enum: ["inactive", "active", "trash"],
        default: "inactive",
      },
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      remarks: { type: String },
      updated_at: { type: Date, default: Date.now },
    },
    createdby: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

emailTemplateSchema.pre("save", function (next) {
  updateStatus(this, "active");
  next();
});

module.exports = mongoose.model("EmailTemplate", emailTemplateSchema);
