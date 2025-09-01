const mongoose = require("mongoose");
const updateStatus = require("../utils/updatestatus.utils");

const inspectionSchema = new mongoose.Schema(
  {
    po_number: {
      type: String,
      required: true,
    },
    inspection_code: {
      type: String,
      required: true,
    },
    vendor: {
      type: String,
    },
    vendor_contact: {
      type: String,
    },
    mode: {
      type: String,
      enum: ["online", "offline"],
    },
    location: {
      type: String,
    },
    description: {
      type: String,
    },
    date: {
      type: Date,
    },
    vendor_mobile: {
      type: String,
    },
    item: [
      {
        category_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MaterialCategory",
        },
        product_name: {
          type: String,
        },
        description: {
          type: String,
        },
        product_make: {
          type: String,
        },
        quantity: {
          type: String,
        },
      },
    ],
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status_history: [
      {
        status: {
          type: String,
          enum: ["failed", "requested", "approved"],
        },
        remarks: {
          type: String,
        },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
        attachments: [
          {
            attachment_url: {
              type: String,
            },
          },
        ],
      },
    ],
    current_status: {
      status: {
        type: String,
        enum: ["failed", "requested", "approved"],
      },
      remarks: {
        type: String,
      },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
  },
  { timestamps: true }
);

inspectionSchema.pre("save", function (next) {
  updateStatus(this, "requested");
  next();
});
module.exports = mongoose.model("inspection", inspectionSchema);
