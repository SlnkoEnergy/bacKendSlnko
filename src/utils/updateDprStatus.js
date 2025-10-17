// utils/updateCurrentStatus.js
function updateDprStatus(
  doc,
  statusHistoryKey = "status_history",
  currentStatusKey = "current_status"
) {
  if (!doc) return;

  const history = doc[statusHistoryKey] || [];
  if (Array.isArray(history) && history.length > 0) {
    const last = history[history.length - 1];
    doc[currentStatusKey] = [
      {
        updated_at: last.updated_at || new Date(),
        phase: last.phase,
        activity_id: last.activity_id,
        assigned_engineer: last.assigned_engineer,
        assigned_status: last.assigned_status,
        work_status: last.work_status,
        work_completion: last.work_completion,
        remarks: last.remarks,
      },
    ];
  } else {
    doc[currentStatusKey] = [
      {
        updated_at: new Date(),
        phase: undefined,
        activity_id: undefined,
        assigned_engineer: undefined,
        assigned_status: undefined,
        work_status: "draft",
        work_completion: 0,
        remarks: "",
      },
    ];
  }
}

module.exports = updateDprStatus;
