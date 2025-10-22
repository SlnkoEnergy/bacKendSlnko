const mongoose = require("mongoose");
const updateStatus = require("../utils/updatestatus.utils");

const emailSchema = new mongoose.Schema(
  {
    email_template_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmailTemplate",
    },
    variables_used: { type: mongoose.Schema.Types.Mixed },
    compiled: {
      to: { type: String },
      cc: [{ type: String }],
      bcc: [{ type: String }],
      from: [{ type: String }],
      replyTo: [{ type: String }],
      subject: { type: String },
      body: { type: String },
      bodyFormat: { type: String, enum: ["html", "text"], default: "html" },
      attachments: [
        {
          filename: String,
          fileUrl: String,
          fileType: String,
        },
      ],
    },
    provider: { type: String, default: "novu" },
    provider_message_id: { type: String },
    provider_request: { type: mongoose.Schema.Types.Mixed },
    provider_response: { type: mongoose.Schema.Types.Mixed },
    error: { type: String },
    status_history: [
      {
        status: { type: String, enum: ["queued", "failed", "sent", "draft"] },
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        remarks: { type: String },
        created_at: { type: Date, default: Date.now },
      },
    ],
    current_status: {
      status: {
        type: String,
        enum: ["queued", "failed", "sent", "draft"],
        default: "queued",
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

emailSchema.pre("save", function (next) {
  updateStatus(this, "queued");
  next();
});

module.exports = mongoose.model("Email", emailSchema);
