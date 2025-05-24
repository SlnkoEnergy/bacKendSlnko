const mongoose = require("mongoose");
const updateExpenseStatus = require("../../middlewares/expenseSheetMiddlewares/updateExpenseStatus");
const updateExpenseStatusItems = require("../../middlewares/expenseSheetMiddlewares/updateExpenseStatusItems");

const expenseSheetSchema = new mongoose.Schema(
  {
    expense_code: { type: String, required: true },
    items: [
      {
        category: {
          type: String,
        },
        project_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "projectDetail",
        },
        description: { type: String },
        expense_date: { type: Date, default: Date.now },
        invoice: {
          invoice_number: String,
          invoice_amount: { type: String, required: true },
        },
        attachment_url: { type: String },
        item_status_history: [
          {
            status: {
              type: String,
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
        approved_amount: { type: String },
        remarks: { type: String },
        item_current_status: {
          type: String,
        },
      },
    ],
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    emp_id:{
      type:String
    },
    emp_name:{
      type:String
    },
    expense_term: {
      from: { type: Date },
      to: { type: Date },
    },
    current_status: {
      type: String,
      enum: ["draft", "submitted", "hold", "rejected", "approved"],
    },
    status_history: [
      {
        status: {
          type: String,
          enum: ["draft", "submitted", "hold", "rejected", "approved"],
        },
        remarks: { type: String },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    total_requested_amount:{
      type:String
    },
    total_approved_amount:{
         type:String
    },
    disbursement_date:{
      type:Date
    },
    comments: { type: String },
  },
  { timestamps: true }
);

// ⏱ Auto-update current_status before save
expenseSheetSchema.pre("save", function (next) {
  updateExpenseStatus(this);
  next();
});

expenseSheetSchema.pre("save", function(next){
  updateExpenseStatusItems(this);
  next();
});

module.exports = mongoose.model("ExpenseSheet", expenseSheetSchema);
