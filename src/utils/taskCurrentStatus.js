function taskCurrentStatus(
  doc,
  statusHistoryKey = "status_history",
  currentStatusKey = "current_status"
) {
  if (!doc) return;
  const history = doc[statusHistoryKey];
  if (history && history.length > 0) {
    doc[currentStatusKey] = history[history.length - 1].status;
  } else {
     doc[currentStatusKey] = "pending";
  }
}
module.exports = taskCurrentStatus;