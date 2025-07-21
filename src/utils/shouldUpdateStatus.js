// utils/shouldUpdateStatus.js
function shouldUpdateStatus(currentStatus, stage) {
  if (!currentStatus) return true;

  const statusOrder = {
    "initial": 0,
    "follow up": 1,
    "warm": 2,
    "won": 3,
    "dead": 4,
  };

  const stageToStatus = {
    loi: "follow up",
    loa: "warm",
    ppa: "warm",
  };

  const intendedStatus = stageToStatus[stage?.toLowerCase()];
  if (!intendedStatus) return true;

  const currentIndex = statusOrder[currentStatus?.toLowerCase()] ?? -1;
  const intendedIndex = statusOrder[intendedStatus?.toLowerCase()] ?? -1;

  return intendedIndex >= currentIndex;
}

module.exports = { shouldUpdateStatus };
