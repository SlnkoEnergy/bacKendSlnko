const mongoose = require("mongoose");
const updateCurrentStatusItems = require("../../../utils/updateCurrentStatusItems");

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
          {
            attachment_number: {
              type: Number,
              required: true,
              default: 0,
            },
            attachment_url: [
              {
                type: String,
              },
            ],
          },
        ],
        current_attachment: {
            attachment_url: [{
              type: String,
            }],
            attachment_number: {
              type: Number,
            },
        },
        status_history: [
          {
            status: {
              type: String,
              enum: ["draft", "active", "archived"],
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
          enum: ["draft", "active", "archived"],
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
  updateCurrentStatusItems(this, "attachment_urls", "current_attachment");
});

module.exports = mongoose.model("moduleCategory", moduleCategorySchema);
