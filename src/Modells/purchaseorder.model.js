const { default: mongoose } = require("mongoose");
const {
  updatePurchaseRequestStatus,
} = require("../utils/updatePurchaseRequestStatus");

const purchaseOrderSchema = new mongoose.Schema(
  {
    p_id: {
      type: String,
    },
    offer_Id: {
      type: String,
    },
    po_number: {
      type: String,
    },
    date: {
      type: String,
    },
    total_bills: {
      type: Number,
      default: 0,
    },
    item: [
      {
        category: {
          type: mongoose.Schema.Types.Mixed,
          ref: "MaterialCategory",
        },
        product_name: {
          type: String,
        },
        product_make: {
          type: String,
        },
        uom: {
          type: String,
        },
        quantity: {
          type: String,
        },
        cost: {
          type: String,
        },
        gst_percent: {
          type: String,
        },
        description: {
          type: String,
        },
      },
    ],
    other: {
      type: String,
      default: " ",
    },
    po_value: {
      type: Number,
    },
    total_advance_paid: {
      type: String,
    },
    po_balance: {
      type: Number,
    },
    vendor: {
      type: String,
    },
    partial_billing: {
      type: String,
    },
    amount_paid: {
      type: Number,
    },
    comment: {
      type: String,
    },
    updated_on: {
      type: String,
    },
    submitted_By: {
      type: String,
    },
    po_basic: {
      type: String,
    },
    gst: { type: String },
    pr_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "purchaseRequest",
    },
    etd: {
      type: Date,
    },
    delivery_date: {
      type: Date,
    },
    dispatch_date: {
      type: Date,
    },
    material_ready_date: {
      type: Date,
    },
    total_billed: {
      type: String,

      default: "0",
    },
    delivery_type: {
      type: String,
      enum: ["afor", "slnko", "client"],
    },

    attachments: [
      {
        attachment_url: {
          type: String,
        },
        attachment_name: {
          type: String,
        },
      },
    ],
    status_history: [
      {
        status: {
          type: String,
          enum: [
            "draft",
            "approval_pending",
            "approval_done",
            "approval_rejected",
            "po_created",
            "out_for_delivery",
            "partially_out_for_delivery",
            "ready_to_dispatch",
            "material_ready",
            "delivered",
            "short_quantity",
            "partially_delivered",
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
          "draft",
          "approval_pending",
          "approval_done",
          "approval_rejected",
          "po_created",
          "out_for_delivery",
          "partially_out_for_delivery",
          "ready_to_dispatch",
          "material_ready",
          "delivered",
          "short_quantity",
          "partially_delivered",
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
  { timestamps: true }
);

purchaseOrderSchema.pre("save", function (next) {
  updatePurchaseRequestStatus(this, "status_history", "current_status");
  next();
});

module.exports = mongoose.model("purchaseOrder", purchaseOrderSchema);
