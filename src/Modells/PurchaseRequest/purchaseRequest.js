const mongoose = require("mongoose");
const updateCurrentStatus = require("../../utils/statusUpdateUtils/updateCurrentStatus");

const purchaseRequestSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
    },
    items: [
      {
        item_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MaterialCategory",
        },
      },
    ],
    status_history: [
      {
        status: {
          type: String,
          enum: [
            "submitted",
            "draft",
            "approved",
            "po_created",
            "rejected",
            "delivered",
          ],
        },
        remarks: {
          type: String,
        },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    current_status: {
      status: {
        type: String,
        enum: [
          "submitted",
          "draft",
          "approved",
          "po_created",
          "rejected",
          "delivered",
        ],
      },
      remarks: {
        type: String,
      },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    pr_no: {
      type: String,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    etd: {
      type: Date,
    },
    delivery_date: {
      type: Date,
    },
  },
  { timestamps: true }
);

purchaseRequestSchema.pre("save", function (next) {
  updateCurrentStatus(this, "status_history", "current_status");
  next();
});

module.exports = mongoose.model("PurchaseRequest", purchaseRequestSchema);
