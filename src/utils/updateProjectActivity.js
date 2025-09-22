const projectActivities = require("../models/projectactivities.model");
async function updateProjectActivityFromApproval(
  approval,
  { paId, activityId, dependencyId },
  { remarks, session } = {}
) {
  if (!approval || !Array.isArray(approval.approvers)) {
    return { applied: false, modifiedCount: 0 };
  }

  const approvers = approval.approvers;
  const hasApprovers = approvers.length > 0;
  const oneRejected = approvers.some(a => a.status === "rejected");
  const allApproved = hasApprovers && approvers.every(a => a.status === "approved");

  // Decide target status
  let targetStatus = null;
  if (oneRejected) targetStatus = "not allowed";
  else if (allApproved) targetStatus = "approved";

  if (!targetStatus) {
    // nothing to do yet (still pending/mixed)
    return { applied: false, modifiedCount: 0 };
  }

  const now = new Date();
  const update = {
    $set: {
      "activities.$[a].dependency.$[d].current_status": {
        status: targetStatus,
        remarks: remarks || (targetStatus === "approved"
          ? "All approvers approved"
          : "One of the approvers rejected"),
        updatedAt: now,
        user_id: approval.current_approver?.user_id || null,
      },
    },
    $push: {
      "activities.$[a].dependency.$[d].status_history": {
        status: targetStatus,
        remarks: remarks || (targetStatus === "approved"
          ? "All approvers approved"
          : "One of the approvers rejected"),
        updatedAt: now,
        user_id: approval.current_approver?.user_id || null,
      },
    },
  };

  const arrayFilters = [
    { "a._id": new mongoose.Types.ObjectId(activityId) },
    { "d._id": new mongoose.Types.ObjectId(dependencyId) },
  ];

  const res = await ProjectActivities.updateOne(
    {
      _id: new mongoose.Types.ObjectId(paId),
      "activities._id": new mongoose.Types.ObjectId(activityId),
      "activities.dependency._id": new mongoose.Types.ObjectId(dependencyId),
    },
    update,
    { arrayFilters, session }
  );

  return { applied: res.modifiedCount > 0, status: targetStatus, modifiedCount: res.modifiedCount };
}
module.exports = updateProjectActivity;