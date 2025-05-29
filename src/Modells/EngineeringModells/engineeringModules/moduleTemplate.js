const mongoose = require("mongoose");

const moduleCategorySchema = new mongoose.Schema(
  {
    file_upload: {
      enabled: {
        type: Boolean,
        default: false,
      },
      max_files: {
        type: Number,
        default: 0,
        validate: {
          validator: function (value) {
            return value >= 0;
          },
          message: "Max files must be a non-negative number",
        },
      },
    },
    blockage: {
      type: mongoose.Schema.ObjectId,
      default: null,
    },
    order: {
      type: String,
    },
    name: {
      type: String,
    },
    description: {
      type: String,
    },
    icon_image: {
      type: String,
    },
    boq: {
      enabled: {
        type: Boolean,
        default: false,
      },
      template_category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "templateCategory",
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("moduleCategory", moduleCategorySchema);