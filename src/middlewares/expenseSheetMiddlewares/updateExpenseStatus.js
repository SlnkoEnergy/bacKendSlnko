// utils/updateExpenseStatus.js

function updateExpenseStatus(expenseSheet) {
  if (!expenseSheet.status_history || expenseSheet.status_history.length === 0) {
    expenseSheet.current_status = "draft";
  } else {
    // Use the latest status in history
    const latestStatus = expenseSheet.status_history[expenseSheet.status_history.length - 1].status;
    expenseSheet.current_status = latestStatus;
  }
}


module.exports = updateExpenseStatus