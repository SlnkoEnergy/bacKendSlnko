const { default: mongoose } = require("mongoose");
const projectActivity = require("../models/projectactivities.model");

async function isAllowedDependency(projectId, model_name) {
  const _projectId =
    typeof projectId === "string"
      ? new mongoose.Types.ObjectId(projectId)
      : projectId;

  const pipeline = [
    { $match: { project_id: _projectId } },
    { $unwind: "$activities" },
    {
      $unwind: {
        path: "$activities.dependency",
        preserveNullAndEmptyArrays: false,
      },
    },
    { $match: { "activities.dependency.model": model_name } },
    {
      $group: {
        _id: "$activities.dependency.model_id",
        statuses: { $addToSet: "$activities.dependency.current_status.status" },
        anyBad: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$activities.dependency.current_status.status",
                  ["not allowed", "approval_pending"],
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $match: {
        anyBad: 0,
        statuses: { $in: ["allowed", "approved"] },
      },
    },
    { $project: { _id: 0, model_id: "$_id" } },
  ];

  const rows = await projectActivity.aggregate(pipeline).exec();
  return rows.map((r) => r.model_id);
}

module.exports = { isAllowedDependency };
