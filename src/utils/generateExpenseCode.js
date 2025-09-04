const ExpenseCounter = require("../models/expensecodecounter.model");
const User = require("../models/users/userModells");
const moment = require("moment");

async function generateExpenseCode(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const now = moment();
  const monthName = now.format("MMMM").toUpperCase();
  const year = now.year();
  const month = now.month() + 1; 

  const counter = await ExpenseCounter.findOneAndUpdate(
    { user_id: userId, year, month },
    { $inc: { count: 1 } },
    { new: true, upsert: true }
  );

  const autoNumber = counter.count.toString().padStart(3, "0");

  return `EXP/${monthName}/${user.emp_id}/${autoNumber}`;
}


module.exports = generateExpenseCode;