function updateExpenseStatusItems(expenseSheet) {
  if (!expenseSheet.items || expenseSheet.items.length === 0) return;

  expenseSheet.items.forEach((item) => {
    if (!item.item_status_history || item.item_status_history.length === 0) {
      item.item_current_status = "draft";
    } else {
      const latestStatus = item.item_status_history[item.item_status_history.length - 1].status;
      item.item_current_status = latestStatus;
    }
  });
}

module.exports = updateExpenseStatusItems;
