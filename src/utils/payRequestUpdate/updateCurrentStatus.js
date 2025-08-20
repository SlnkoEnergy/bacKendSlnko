function updateCurrentStatus(
  doc,
  statusHistoryKey = "status_history",
  currentStatusKey = "approval_status",
  utrHistoryKey = "utr_history",
  currentUtrKey = "utr"
) {
  if (!doc) return;

  // --- Status handling ---
  const history = doc[statusHistoryKey] || [];
  const lastStatus = history[history.length - 1];

  if (lastStatus) {
    doc[currentStatusKey] = {
      stage: lastStatus.stage,
      remarks: lastStatus.remarks || "",
      user_id: lastStatus.user_id || null,
      timestamp: lastStatus.timestamp || new Date(),
    };
  } else {
    const defaultStage = doc.credit?.credit_deadline
      ? "Credit Pending"
      : "Draft";

    doc[currentStatusKey] = {
      stage: defaultStage,
      remarks: "",
      user_id: null,
      timestamp: new Date(),
    };
  }

  // --- UTR handling ---
  const utrHistory = doc[utrHistoryKey] || [];

  if (doc.isModified(currentUtrKey) && doc[currentUtrKey]) {
    utrHistory.push({
      utr: doc[currentUtrKey],
      user_id: doc.approval_status?.user_id || null,
      status: utrHistory.length === 0 ? "Created" : "Updated",
      timestamp: new Date(),
    });
  }

  if (utrHistory.length > 0) {
    doc[currentUtrKey] = utrHistory[utrHistory.length - 1].utr;
  }

  doc[utrHistoryKey] = utrHistory;
}

module.exports = updateCurrentStatus;
