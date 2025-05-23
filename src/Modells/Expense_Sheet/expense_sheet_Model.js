const mongoose = require("mongoose");
const updateExpenseStatus = require("../../middlewares/expenseSheetMiddlewares/updateExpenseStatus");

const expenseSheetSchema = new mongoose.Schema({
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
      status: { type: String },
      approved_amount: { type: String },
    },
  ],
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
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
      remarks: String,
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      updatedAt: { type: Date, default: Date.now },
    },
  ],
  comments: { type: String, required: true },
}, {timestamps: true});

// ⏱ Auto-update current_status before save
expenseSheetSchema.pre("save", function (next) {
  updateExpenseStatus(this);
  next();
});

module.exports = mongoose.model("ExpenseSheet", expenseSheetSchema);
