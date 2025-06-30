function updateCurrentStatusItems(
  doc,
  statusHistoryKey = "status_history",
  currentStatusKey = "current_status"
) {
  if (!doc || !Array.isArray(doc.items)) return;

  doc.items.forEach((item) => {
    const history = item[statusHistoryKey];
    if (!history || history.length === 0) {
      item[currentStatusKey.status] = "draft";
      item[currentStatusKey.remarks] = "";
        item[currentStatusKey.user_id] = null; 
    } else {
      item[currentStatusKey] = history[history.length - 1]
    }
  });
}

module.exports = updateCurrentStatusItems;
