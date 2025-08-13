function updateCurrentStatus(
  doc,
  statusHistoryKey = "status_history",
  currentStatusKey = "approval_status"
) {
  if (!doc) return;

  const history = doc[statusHistoryKey];

  if (history && history.length > 0) {
    doc[currentStatusKey] = {
      stage: history[history.length - 1].stage,
      remarks: history[history.length - 1].remarks || "",
      user_id: history[history.length - 1].user_id || null,
      timestamp: history[history.length - 1].timestamp || new Date(),
    };
  } else {
    const defaultStage =
      doc.credit && doc.credit.credit_deadline ? "Credit Pending" : "Draft";

    doc[currentStatusKey] = {
      stage: defaultStage,
      remarks: "",
      user_id: null,
      timestamp: new Date(),
    };
  }
}

module.exports = updateCurrentStatus;
