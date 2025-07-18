const statusPriority = {
  draft: 0,
  ready_to_dispatch:1,
  out_for_delivery: 2,
  delivered: 3,
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
