function updateCurrentStatus(
  doc,
  statusHistoryKey = "status_history",
  currentStatusKey = "current_status"
) {
  if (!doc) return;
  // status_history is directly on the doc object
  const history = doc[statusHistoryKey];
  if (history && history.length > 0) {
    doc[currentStatusKey] = history[history.length - 1].status;
  } else {
    doc[currentStatusKey] = "draft";
  }
}

module.exports = updateCurrentStatus;
