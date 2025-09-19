function applyPredecessorLogic(activities, activity) {
  console.log("Before:", activity.planned_start, activity.planned_finish);
  
  if (!activity.predecessors || activity.predecessors.length === 0) return;

  activity.predecessors.forEach(predLink => {
    const pred = activities.find(a => a.activity_id.equals(predLink.activity_id));
    if (!pred) return;

    const lag = predLink.lag || 0;
    switch (predLink.type) {
      case "FS": // Finish-to-Start
        if (pred.planned_finish) {
          const newStart = new Date(new Date(pred.planned_finish).getTime() + lag * 24 * 60 * 60 * 1000);
          activity.planned_start = activity.planned_start
            ? new Date(Math.max(activity.planned_start.getTime(), newStart.getTime()))
            : newStart;
        }
        break;
      case "SS": // Start-to-Start
        if (pred.planned_start) {
          const newStart = new Date(new Date(pred.planned_start).getTime() + lag * 24 * 60 * 60 * 1000);
          activity.planned_start = activity.planned_start
            ? new Date(Math.max(activity.planned_start.getTime(), newStart.getTime()))
            : newStart;
        }
        break;
      case "FF": // Finish-to-Finish
        if (pred.planned_finish) {
          const newFinish = new Date(new Date(pred.planned_finish).getTime() + lag * 24 * 60 * 60 * 1000);
          activity.planned_finish = activity.planned_finish
            ? new Date(Math.max(activity.planned_finish.getTime(), newFinish.getTime()))
            : newFinish;
        }
        break;
      case "SF": // Start-to-Finish
        if (pred.planned_start) {
          const newFinish = new Date(new Date(pred.planned_start).getTime() + lag * 24 * 60 * 60 * 1000);
          activity.planned_finish = activity.planned_finish
            ? new Date(Math.max(activity.planned_finish.getTime(), newFinish.getTime()))
            : newFinish;
        }
        break;
      default:
        break;
    }
  });

  console.log("After:", activity.planned_start, activity.planned_finish);
}

module.exports = { applyPredecessorLogic };