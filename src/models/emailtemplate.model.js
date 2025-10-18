const mongoose = require("mongoose");
const updateStatus = require("../utils/updatestatus.utils");

const emailTemplateSchema = new mongoose.Schema(
  {
    to: [{ type: String, required: true }],
    cc: [{ type: String }],
    bcc: [{ type: String }],
    from: [{ type: String, required: true }],
    subject: { type: String, required: true },
    body: { type: String, required: true },
    status_history: [
      {
        status: { type: String, enum: ["inactive", "active"] },
        user_id: {
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
        enum: ["inactive", "active"],
      },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      remarks: {
        type: String,
      },
    },
    attachments: [
      {
        filename: String,
        fileUrl: String,
        fileType: String,
      },
    ],
    createdby: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

emailTemplateSchema.pre("save", function (next) {
  updateStatus(this, "inactive");
  next();
});
module.exports = mongoose.model("EmailTemplate", emailTemplateSchema);
