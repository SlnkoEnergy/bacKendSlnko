const statusPriority = {
  draft: 0,
  out_for_delivery: 1,
  delivered: 2,
};

const getLowerPriorityStatus = (statuses) => {
  const sorted = statuses.sort((a, b) => statusPriority[a] - statusPriority[b]);
  return sorted[0];
};


async function updatePurchaseRequestStatus(
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
      status: "draft",
      remarks: "",
      user_id: null,
    };
  }
}

module.exports = {updatePurchaseRequestStatus, getLowerPriorityStatus};
