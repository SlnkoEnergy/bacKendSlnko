const mongoose = require("mongoose");
const updateModuleCategoryStatus = require("../../../middlewares/engineeringMiddlewares/updateModuleCategory");
const moduleTemplate = require("./moduleTemplate");

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
        attachment_url: [{
          type: String,
        }],
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
  updateModuleCategoryStatus(this);
  next();
});

module.exports = mongoose.model("moduleCategory", moduleCategorySchema);
