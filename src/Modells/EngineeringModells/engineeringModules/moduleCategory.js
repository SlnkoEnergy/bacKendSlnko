const mongoose = require("mongoose");
const updateCurrentStatusItems = require("../../../utils/updateCurrentStatusItems");
const updateAttachmentUrlStatus = require("../../../middlewares/engineeringMiddlewares/updateAttachementUrlStatus");

const moduleCategorySchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
    },
    items: [
      {
        template_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "moduleTemplates",
        },
        attachment_urls: [
          [
            {
              type: String,
            },
          ],
        ],
        current_attachment: [
          {
            type: String,
          },
        ],
        status_history: [
          {
            status: {
              type: String,
              enum: ["draft", "submitted", "revised", "approved"],
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
          type: String,
          enum: ["draft", "submitted", "revised", "approved"],
        },
      },
    ],
  },
  { timestamps: true }
);

moduleCategorySchema.pre("save", function (next) {
  updateCurrentStatusItems(this, "status_history", "current_status");
  next();
});

moduleCategorySchema.pre("save", function (next) {
  updateAttachmentUrlStatus(this, "attachment_urls", "current_attachment");
  next();
});

module.exports = mongoose.model("moduleCategory", moduleCategorySchema);
