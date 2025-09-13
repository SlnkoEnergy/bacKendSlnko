function updateSubtaskStatus(task) {
  if (!task.sub_tasks || task.sub_tasks.length === 0) return;
  const allDone = task.sub_tasks.every((st) => st.status === "completed");

  if (allDone) {
    task.current_status = {
      status: "completed",
      remarks: "All subtasks completed",
      user_id: task.current_status?.user_id || task.createdBy,
    };

    task.status_history.push({
      status: "completed",
      remarks: "Auto-completed since all subtasks are done",
      user_id: task.current_status?.user_id || task.createdBy,
    });
  }
}

module.exports = updateSubtaskStatus;
