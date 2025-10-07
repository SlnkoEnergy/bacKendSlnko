const { default: mongoose } = require("mongoose");
const {
  updatePurchaseRequestStatus,
} = require("../utils/updatePurchaseRequestStatus");

const salesDetailSchema = new mongoose.Schema(
  {
    remarks: { type: String, required: true },
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
    converted_at: { type: Date, default: Date.now },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);


const purchaseOrderSchema = new mongoose.Schema(
  {
    p_id: {
      type: String,
    },
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
    },
    project_name: {
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
          type: mongoose.Schema.Types.ObjectId,
          ref: "MaterialCategory",
        },
        category_name: {
          type: String,
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
      type: Number,
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
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    po_basic: {
      type: String,
    },
    gst: { type: String },
    pr: {
      pr_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "purchaseRequest",
      },
      pr_no: {
        type: String,
      },
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
      enum: ["for", "slnko", "client"],
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
    isSales: { type: Boolean, default: false },
    sales_Details: [salesDetailSchema],
  },
  { timestamps: true }
);

purchaseOrderSchema.pre("save", function (next) {
  updatePurchaseRequestStatus(this, "status_history", "current_status");
  next();
});

module.exports = mongoose.model("purchaseOrder", purchaseOrderSchema);
