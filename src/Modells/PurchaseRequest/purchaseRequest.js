const mongoose = require("mongoose");
const updateCurrentStatusItems = require("../../utils/statusUpdateUtils/updateCurrentStatusItems");

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
        etd: {
          type: Date,
        },
        delivery_date: {
          type: Date,
        },
        status_history: [
          {
            status: {
              type: String,
              enum: [
                "submitted",
                "draft",
                "po_created",
                "out_for_delivery",
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
              "po_created",
              "out_for_delivery",
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
      },
    ],
    status: {
      type: String,
    },
    pr_no: {
      type: String,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

purchaseRequestSchema.pre("save", function (next) {
  updateCurrentStatusItems(this, "status_history", "current_status");
  next();
});

module.exports = mongoose.model("PurchaseRequest", purchaseRequestSchema);