function updateCurrentStatusTask(
  doc,
  statusHistoryKey = "status_history",
  currentStatusKey = "current_status"
) {
  if (!doc) return;
  const history = doc[statusHistoryKey];
  if (history && history.length > 0) {
    doc[currentStatusKey] = history[history.length - 1];
  } else {
    doc[currentStatusKey] = {
      status: "pending",
      remarks: "",
      user_id: null,
    };
  }
}
module.exports = updateCurrentStatusTask;