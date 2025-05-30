const mongoose = require('mongoose');

const expenseCounterSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year: Number,
  month: Number, 
  count: { type: Number, default: 0 }
});

expenseCounterSchema.index({ user_id: 1, year: 1, month: 1 }, { unique: true });

const ExpenseCounter = mongoose.model('ExpenseCounter', expenseCounterSchema);

module.exports = ExpenseCounter;
