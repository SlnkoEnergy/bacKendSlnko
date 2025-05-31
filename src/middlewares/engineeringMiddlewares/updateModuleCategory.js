function updateModuleCategoryStatus(moduleCategories) {
  if (!moduleCategories.items || moduleCategories.items.length === 0) return;

  moduleCategories.items.forEach((item) => {
    if (!item.status_history || item.status_history.length === 0) {
      item.current_status = "draft";
    } else {
      const latestStatus = item.status_history[item.status_history.length - 1].status;
      item.current_status = latestStatus;
    }
  });
}


module.exports = updateModuleCategoryStatus;