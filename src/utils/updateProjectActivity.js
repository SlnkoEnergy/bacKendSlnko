const mongoose = require("mongoose");
const ProjectActivities = require("../models/projectactivities.model");
const { triggerTasksBulk } = require("./triggertask.utils");

async function updateProjectActivityFromApproval(
  approval,
  model_id,
  activityId,
  dependencyId,
  remarks,
  session = null
) {
  if (!approval || !Array.isArray(approval.approvers)) {
    return { applied: false, modifiedCount: 0 };
  }

  const approvers = approval.approvers;
  const hasApprovers = approvers.length > 0;
  const oneRejected = approvers.some((a) => a.status === "rejected");
  const allApproved =
    hasApprovers && approvers.every((a) => a.status === "approved");

  const rejectStatus = "rejected";
  let targetStatus = null;
  if (oneRejected) targetStatus = rejectStatus;
  else if (allApproved) targetStatus = "approved";
  if (!targetStatus) {
    return { applied: false, modifiedCount: 0 };
  }

  const now = new Date();
  const reason =
    remarks ||
    (targetStatus === "approved"
      ? "All approvers approved"
      : "One of the approvers rejected");

  const update = {
    $set: {
      "activities.$[a].dependency.$[d].current_status": {
        status: targetStatus,
        remarks: reason,
        updatedAt: now,
        user_id: approval.current_approver?.user_id || null,
      },
    },
    $push: {
      "activities.$[a].dependency.$[d].status_history": {
        status: targetStatus,
        remarks: reason,
        updatedAt: now,
        user_id: approval.current_approver?.user_id || null,
      },
    },
  };

  const arrayFilters = [
    { "a._id": new mongoose.Types.ObjectId(activityId) },
    { "d._id": new mongoose.Types.ObjectId(dependencyId) },
  ];

  // Base selector
  const selector = {
    _id: new mongoose.Types.ObjectId(model_id),
    "activities._id": new mongoose.Types.ObjectId(activityId),
    "activities.dependency._id": new mongoose.Types.ObjectId(dependencyId),
  };

  const res = await ProjectActivities.updateOne(selector, update, {
    arrayFilters,
    session,
  });

  if (targetStatus === "approved") {
    const projectActivity = await ProjectActivities.findById(model_id);
    const activity = projectActivity.activities.id(activityId);
    const dependency = activity.dependency.id(dependencyId);
    const allDepsApproved = activity.dependency.every(
      (dep) =>
        dep.current_status.status === "approved" ||
        dep.current_status.status === "allowed"
    );
    if (allDepsApproved) {
      const tasksPayloads = activity.dependency.map((dep) => {
        const isModuleTemplate = dep?.model === "moduleTemplates";
        const title = isModuleTemplate
          ? `${dep?.model_id_name}`
          : `PR for ${dep?.model_id_name}`;

        return {
          title,
          description: `Task generated for approved ${dep?.model_id_name}`,
          project_id: [projectActivity.project_id],
          userId: approval.created_by,
          sourceKey: `PA:${model_id}:${activityId}:${dep._id}`,
          source: {
            type: "projectActivityDependency",
            model_id: new mongoose.Types.ObjectId(model_id),
            activityId: new mongoose.Types.ObjectId(activityId),
            dependencyId: dep._id,
          },
        };
      });

      await triggerTasksBulk(tasksPayloads, session);
    }
  }

  return {
    applied: res.modifiedCount > 0,
    status: targetStatus,
    modifiedCount: res.modifiedCount,
  };
}

module.exports = updateProjectActivityFromApproval;
