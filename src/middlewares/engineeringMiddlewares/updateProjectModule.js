function updateModuleProjectStatus(moduleProjects) {
  if (!moduleProjects.status_history || moduleProjects.status_history.length === 0) {
    moduleProjects.current_status = "draft";
  } else {
    // Use the latest status in history
    const latestStatus = moduleProjects.status_history[moduleProjects.status_history.length - 1].status;
    moduleProjects.current_status = latestStatus;
  }
}


module.exports = updateModuleProjectStatus