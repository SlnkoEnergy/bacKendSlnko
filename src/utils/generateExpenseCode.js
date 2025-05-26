const ExpenseSheet = require("../Modells/Expense_Sheet/expense_sheet_Model");
const User = require("../Modells/userModells");
const moment = require("moment");

async function generateExpenseCode(userId) {
  // Find user for emp_id
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Get current date info
  const now = moment();

  // Get month full name in uppercase, e.g. MAY
  const monthName = now.format("MMMM").toUpperCase(); // 'May' => 'MAY'

  // Calculate week of month (1-based)
  const weekOfMonth = Math.ceil(now.date() / 7);
  // const week = weekOfMonth < 10 ? "0" + weekOfMonth : weekOfMonth.toString();

  // Count existing expense sheets this month for user
  const count = await ExpenseSheet.countDocuments({
    user_id: userId,
    createdAt: {
      $gte: now.startOf("month").toDate(),
      $lt: now.endOf("month").toDate(),
    },
  });

  // Auto number padded
  const autoNumber = (count + 1).toString().padStart(3, "0");

  // Format: EXP/MAY-01/EMP_ID/001
  return `EXP/${monthName}/${user.emp_id}/${autoNumber}`;
}

module.exports = generateExpenseCode;