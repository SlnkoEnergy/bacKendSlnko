const { default: mongoose } = require("mongoose");

const customerSummarySchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
      index: true,
    },
    credit: {
      type: [
        {
          _id: false,
          cr_amount: Number,
          cr_date: Date,
          submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          comment: String,
          cr_mode: String,
        },
      ],
      default: [],
    },
    debit: {
      type: [
        {
          _id: false,
          dbt_date: Date,
          amount_paid: Number,
          vendor: String,
          paid_for: String,
          submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          comment: String,
          pay_type: String,
          utr: String,
          other: String,
          utr_submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          po_number: String,
        },
      ],
      default: [],
    },
    purchaseOrder: {
      type: [
        {
          _id: false,
          po_number: String,
          po_value: Number,
          submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          paid_for: String,
          vendor: String,
          item: [
            {
              category: { type: mongoose.Schema.Types.ObjectId, ref: "MaterialCategory" },
              category_name: String,
              product_name: String,
              product_make: String,
              uom: String,
              quantity: String,
              cost: String,
              gst_percent: String,
              description: String,
            },
          ],
          other: { type: String, default: "" },
          amount_paid: Number,
          po_basic: String,
          gst: String,
          remarks: String,
          isSales: { type: Boolean, default: false },
          total_billed: { type: String, default: "0" },
        },
      ],
      default: [],
    },
    salesOrder: {
      type: [
        {
          _id: false,
          po_number: String,
          remarks: { type: String, required: true },
          attachments: [
            {
              attachment_url: String,
              attachment_name: String,
            },
          ],
          converted_at: { type: Date, default: Date.now },
          basic_sales: { type: Number, required: true },
          gst_on_sales: { type: Number, required: true },
          user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        },
      ],
      default: [],
    },
    adjustment: {
      type: [
        {
          _id: false,
          pay_id: String,
          cr_id: String,
          pay_type: String,
          amount_paid: Number,
          dbt_date: Date,
          paid_for: String,
          vendor: String,
          po_number: String,
          po_value: Number,
          adj_type: String,
          adj_amount: Number,
          remark: String,
          adj_date: Date,
          submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          comment: String,
        },
      ],
      default: [],
    },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Virtuals
customerSummarySchema.virtual("totalCredit").get(function () {
  return this.credit.reduce((sum, c) => sum + (c.cr_amount || 0), 0);
});
customerSummarySchema.virtual("totalDebit").get(function () {
  return this.debit.reduce((sum, d) => sum + (d.amount_paid || 0), 0);
});
customerSummarySchema.virtual("totalPoValue").get(function () {
  return this.purchaseOrder.reduce((sum, d) => sum + (d.po_value || 0), 0);
});

module.exports = mongoose.model("customerSummary", customerSummarySchema);
