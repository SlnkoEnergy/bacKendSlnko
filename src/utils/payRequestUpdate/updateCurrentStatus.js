function updateCurrentStatus(doc, update = {}) {
  if (!doc) return;

  const history = doc.status_history || [];
  const lastStatus = history[history.length - 1];

  if (lastStatus) {
    doc.approval_status = {
      stage: lastStatus.stage,
      remarks: lastStatus.remarks || "",
      user_id: lastStatus.user_id || null,
      timestamp: lastStatus.timestamp || new Date(),
    };
  } else {
    const defaultStage = doc.credit?.credit_deadline
      ? "Credit Pending"
      : "Draft";

    doc.approval_status = {
      stage: defaultStage,
      remarks: "",
      user_id: null,
      timestamp: new Date(),
    };
  }

  const utrHistory = doc.utr_history || [];

  const incomingUtr = update.utr ?? doc.utr;

  if (incomingUtr && incomingUtr !== doc.utr) {
    utrHistory.push({
      utr: incomingUtr,
      user_id: doc.approval_status?.user_id || null,
      status: utrHistory.length === 0 ? "Created" : "Updated",
      timestamp: new Date(),
    });
  }

  if (utrHistory.length > 0) {
    doc.utr = utrHistory[utrHistory.length - 1].utr;
  }

  doc.utr_history = utrHistory;
}

module.exports = updateCurrentStatus;
