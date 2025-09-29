const projectActivity = require("../models/projectactivities.model");
const activityModel = require("../models/activities.model");
const { default: mongoose } = require("mongoose");
const { nextTemplateId } = require("../utils/templatecounter.utils");
const {
  rebuildSuccessorsFromPredecessors,
  topoSort,
  computeMinConstraints,
  isBefore,
  propagateForwardAdjustments,
  durationFromStartFinish,
} = require("../utils/predecessor.utils");
const { triggerTasksBulk } = require("../utils/triggertask.utils");
const handoversheetModel = require("../models/handoversheet.model");
const projectModel = require("../models/project.model");

function stripTemplateCode(payload = {}) {
  const { template_code, ...rest } = payload;
  return rest;
}

const createProjectActivity = async (req, res) => {
  try {
    const data = req.body;
    const template_code = data.template_code || (await nextTemplateId());

    const projectactivityDoc = new projectActivity({
      ...data,
      template_code,
      created_by: req.user.userId,
    });

    await projectactivityDoc.save();
    return res
      .status(201)
      .json({ message: "Activity created successfully", projectactivityDoc });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.template_code) {
      return res.status(409).json({
        message: "Template code already exists. Please retry.",
        error: error.message,
      });
    }
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getAllProjectActivities = async (req, res) => {
  try {
    const { search = "", status, page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

    const match = {};
    if (status) match.status = status;

    const searchRegex =
      search && String(search).trim() !== ""
        ? new RegExp(String(search).trim().replace(/\s+/g, ".*"), "i")
        : null;

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "created_by",
          foreignField: "_id",
          as: "_creator",
          pipeline: [{ $project: { _id: 1, name: 1 } }],
        },
      },
      {
        $addFields: {
          created_by_name: {
            $ifNull: [{ $arrayElemAt: ["$_creator.name", 0] }, null],
          },
        },
      },
      {
        $project: {
          _id: 1,
          template_code: 1,
          template_name: "$name",
          description: 1,
          status: 1,
          created_by: "$created_by_name",
          createdAt: 1,
        },
      },
    ];

    if (searchRegex) {
      pipeline.push({
        $match: {
          $or: [
            { template_code: searchRegex },
            { template_name: searchRegex },
            { description: searchRegex },
            { created_by: searchRegex },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          items: [{ $skip: (pageNum - 1) * pageSize }, { $limit: pageSize }],
          totalCount: [{ $count: "count" }],
        },
      }
    );

    const [result] = await projectActivity.aggregate(pipeline);
    const items = result?.items ?? [];
    const total = result?.totalCount?.[0]?.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return res.status(200).json({
      ok: true,
      page: pageNum,
      limit: pageSize,
      total,
      totalPages,
      rows: items,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const editProjectActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const data = stripTemplateCode(req.body);

    const projectactivity = await projectActivity.findByIdAndUpdate(id, data, {
      new: true,
    });
    if (!projectactivity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    return res
      .status(200)
      .json({ message: "Activity updated successfully", projectactivity });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const deleteProjectActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const projectactivity = await projectActivity.findByIdAndDelete(id);
    if (!projectactivity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    return res.status(200).json({ message: "Activity deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateProjectActivityStatus = async (req, res) => {
  try {
    const { projectId, activityId } = req.params;
    const { status, remarks } = req.body;
    const projectactivity = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectactivity) {
      return res.status(404).json({ message: "Project activity not found" });
    }

    const activity = projectactivity.activities?.find(
      (act) => act.activity_id.toString() === activityId
    );
    if (!activity) {
      return res.status(404).json({ message: "Activity not found in project" });
    }

    activity.status_history = activity.status_history || [];
    activity.status_history.push({
      status,
      remarks,
      updated_by: req.user.userId,
      updated_at: new Date(),
    });

    if (status === "completed") {
      activity.dependency.forEach((dep) => {
        dep.status_history = dep.status_history || [];
        dep.status_history.push({
          status: "allowed",
          remarks: "Auto-updated to allowed as parent activity is completed",
          user_id: req.user.userId,
          updatedAt: new Date(),
        });
      });
    }

    await projectactivity.save();
    return res
      .status(200)
      .json({ message: "Status updated successfully", projectactivity });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getProjectActivitybyProjectId = async (req, res) => {
  try {
    const { projectId } = req.query;
    const doc = await projectActivity
      .findOne({ project_id: projectId })
      .populate("activities.activity_id", "name description type")
      .populate("created_by", "name")
      .populate(
        "project_id",
        "code project_completion_date ppa_expiry_date bd_commitment_date remaining_days"
      )
      .lean();

    if (!doc) {
      return res.status(404).json({ message: "Project activity not found" });
    }

    const acts = Array.isArray(doc.activities) ? doc.activities.slice() : [];
    acts.sort((a, b) => {
      const ao = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
      const bo = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      const an = a?.activity_id?.name || "";
      const bn = b?.activity_id?.name || "";
      return an.localeCompare(bn);
    });

    return res.status(200).json({
      message: "Project activity fetched successfully",
      projectactivity: { ...doc, activities: acts },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const reorderProjectActivities = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { ordered_activity_ids } = req.body;

    if (!Array.isArray(ordered_activity_ids) || !ordered_activity_ids.length) {
      return res
        .status(400)
        .json({ message: "ordered_activity_ids array required" });
    }

    const doc = await projectActivity.findOne({ project_id: projectId });
    if (!doc) {
      return res.status(404).json({ message: "Project activity not found" });
    }
    const idToOrder = new Map(
      ordered_activity_ids.map((id, idx) => [String(id), idx])
    );

    const tailStart = idToOrder.size;
    let tailCursor = tailStart;
    doc.activities.forEach((sub) => {
      const key = String(sub.activity_id);
      if (idToOrder.has(key)) {
        sub.order = idToOrder.get(key);
      } else {
        sub.order = tailCursor++;
      }
    });

    await doc.save();

    return res.status(200).json({ message: "Order updated" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const nameSearchActivityByProjectId = async (req, res) => {
  try {
    const { projectId, page, limit, search } = req.query;

    if (!projectId) {
      return res
        .status(400)
        .json({ ok: false, message: "projectId is required" });
    }

    let projId;
    try {
      projId = new mongoose.Types.ObjectId(projectId);
    } catch {
      return res.status(400).json({ ok: false, message: "Invalid projectId" });
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 7, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    const searchRegex =
      search && String(search).trim() !== ""
        ? new RegExp(String(search).trim().replace(/\s+/g, ".*"), "i")
        : null;

    const baseStages = [
      { $match: { project_id: projId } },
      { $unwind: "$activities" },

      // Join base activity info
      {
        $lookup: {
          from: "activities",
          localField: "activities.activity_id",
          foreignField: "_id",
          as: "actInfo",
        },
      },
      { $unwind: "$actInfo" },

      // Optional search
      ...(searchRegex
        ? [
            {
              $match: {
                $or: [
                  { "actInfo.name": searchRegex },
                  { "actInfo.description": searchRegex },
                ],
              },
            },
          ]
        : []),

      // Look up dependency targets (moduletemplates and materialcategories)
      {
        $lookup: {
          from: "moduletemplates",
          localField: "activities.dependency.model_id",
          foreignField: "_id",
          as: "depModules",
        },
      },
      {
        $lookup: {
          from: "materialcategories",
          localField: "activities.dependency.model_id",
          foreignField: "_id",
          as: "depMaterials",
        },
      },

      // Enrich dependencies -> add model_name (FIXED NESTING)
      {
        $addFields: {
          "activities.dependency": {
            $map: {
              input: { $ifNull: ["$activities.dependency", []] },
              as: "dep",
              in: {
                // OUTER let: cheap/common values
                $let: {
                  vars: {
                    depModelLower: {
                      $toLower: { $ifNull: ["$$dep.model", ""] },
                    },
                    populatedName: {
                      $cond: [
                        { $eq: [{ $type: "$$dep.model_id" }, "object"] },
                        {
                          $ifNull: [
                            "$$dep.model_id.name",
                            "$$dep.model_id.title",
                          ],
                        },
                        null,
                      ],
                    },
                  },
                  in: {
                    // INNER let #1: compute ObjectId once
                    $let: {
                      vars: {
                        depModelIdObj: {
                          $cond: [
                            { $eq: [{ $type: "$$dep.model_id" }, "objectId"] },
                            "$$dep.model_id",
                            {
                              $convert: {
                                input: "$$dep.model_id",
                                to: "objectId",
                                onError: null,
                                onNull: null,
                              },
                            },
                          ],
                        },
                      },
                      in: {
                        // INNER let #2: now we can safely use depModelIdObj
                        $let: {
                          vars: {
                            foundModule: {
                              $arrayElemAt: [
                                {
                                  $filter: {
                                    input: "$depModules",
                                    as: "m",
                                    cond: {
                                      $eq: ["$$m._id", "$$depModelIdObj"],
                                    },
                                  },
                                },
                                0,
                              ],
                            },
                            foundMaterial: {
                              $arrayElemAt: [
                                {
                                  $filter: {
                                    input: "$depMaterials",
                                    as: "mc",
                                    cond: {
                                      $eq: ["$$mc._id", "$$depModelIdObj"],
                                    },
                                  },
                                },
                                0,
                              ],
                            },
                          },
                          in: {
                            $mergeObjects: [
                              "$$dep",
                              {
                                model_name: {
                                  // 1) if populated object already has name/title, prefer it
                                  $cond: [
                                    { $ne: ["$$populatedName", null] },
                                    "$$populatedName",
                                    {
                                      // 2) module-template like
                                      $cond: [
                                        {
                                          $in: [
                                            "$$depModelLower",
                                            [
                                              "moduletemplate",
                                              "moduletemplates",
                                              "module",
                                              "modules",
                                            ],
                                          ],
                                        },
                                        {
                                          $ifNull: [
                                            {
                                              $ifNull: [
                                                "$$foundModule.name",
                                                "$$foundModule.title",
                                              ],
                                            },
                                            "$$dep.model",
                                          ],
                                        },
                                        {
                                          // 3) material-category like
                                          $cond: [
                                            {
                                              $in: [
                                                "$$depModelLower",
                                                [
                                                  "materialcategory",
                                                  "materialcategories",
                                                ],
                                              ],
                                            },
                                            {
                                              $ifNull: [
                                                {
                                                  $ifNull: [
                                                    "$$foundMaterial.name",
                                                    "$$foundMaterial.title",
                                                  ],
                                                },
                                                "$$dep.model",
                                              ],
                                            },
                                            // 4) fallback
                                            "$$dep.model",
                                          ],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // Final projection
      {
        $project: {
          activity_id: "$activities.activity_id",
          name: "$actInfo.name",
          description: "$actInfo.description",
          type: "$actInfo.type",
          dependency: "$activities.dependency",
          createdAt: { $ifNull: ["$activities.createdAt", "$createdAt"] },
        },
      },
    ];

    const pipeline = [
      ...baseStages,
      {
        $facet: {
          items: [
            { $sort: { createdAt: -1, _id: -1 } },
            { $skip: skip },
            { $limit: pageSize },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await projectActivity.aggregate(pipeline);
    const items = result?.items ?? [];
    const total = result?.totalCount?.[0]?.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return res.status(200).json({
      ok: true,
      page: pageNum,
      limit: pageSize,
      total,
      totalPages,
      activities: items,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const pushActivityToProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description, type, dependencies = [] } = req.body;

    const activity = await activityModel.create({
      name,
      description,
      type,
      created_by: req.user.userId,
      dependency: dependencies.map((dep) => ({
        model: dep.model,
        model_id: dep.model_id,
        model_id_name: dep.model_id_name,
        updated_by: req.user.userId,
      })),
    });

    const activity_id = activity._id;
    const dependency = activity.dependency;
    const projectactivity = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectactivity) {
      return res.status(404).json({ message: "Project activity not found" });
    }
    projectactivity.activities.push({ activity_id, dependency });
    await projectactivity.save();
    return res.status(200).json({
      message: "Activity added to project successfully",
      projectactivity,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateActivityInProject = async (req, res) => {
  try {
    const { projectId, activityId } = req.params;
    const data = req.body;

    const useActuals = req.query.actuals === "1" || data?.use_actuals === true;

    const projectActivityDoc = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectActivityDoc) {
      return res.status(404).json({ message: "Project not found" });
    }
    // safest + fast
    const proj = await projectModel.findById(projectId).select("p_id").lean();

    if (!proj || !proj.p_id) {
      return res.status(404).json({ message: "Project or p_id not found" });
    }

    const handover = await handoversheetModel.findOne({ p_id: proj.p_id });

    const activityIdObj = new mongoose.Types.ObjectId(activityId);
    const activity = projectActivityDoc.activities.find((act) =>
      act.activity_id.equals(activityIdObj)
    );
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    /* -------- Normalize and assign incoming fields -------- */
    const allowedLinkTypes = new Set(["FS", "SS", "FF", "SF"]);
    let incomingPreds = Array.isArray(data.predecessors)
      ? data.predecessors
      : null;
    let incomingSuccs = Array.isArray(data.successors) ? data.successors : null;

    if (incomingPreds) {
      const seen = new Set();
      incomingPreds = incomingPreds
        .filter((p) => p && p.activity_id)
        .map((p) => ({
          activity_id: new mongoose.Types.ObjectId(p.activity_id),
          type: allowedLinkTypes.has(String(p.type).toUpperCase())
            ? String(p.type).toUpperCase()
            : "FS",
          lag: Number(p.lag) || 0,
        }))
        .filter((p) => {
          const key = String(p.activity_id);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      activity.predecessors = incomingPreds;
    }

    if (incomingSuccs) {
      const seen = new Set();
      incomingSuccs = incomingSuccs
        .filter((p) => p && p.activity_id)
        .map((p) => ({
          activity_id: new mongoose.Types.ObjectId(p.activity_id),
          type: allowedLinkTypes.has(String(p.type).toUpperCase())
            ? String(p.type).toUpperCase()
            : "FS",
          lag: Number(p.lag) || 0,
        }))
        .filter((p) => {
          const key = String(p.activity_id);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      activity.successors = incomingSuccs;
    }

    // Assign any other editable scalar fields (planned_* etc., resources, remarks…)
    const { predecessors, successors, actual_start, actual_finish, ...rest } =
      data || {};
    Object.assign(activity, rest);

    const prevStatus = activity.current_status?.status || "not started";
    const newStatus = data.status || prevStatus;

    if (newStatus && newStatus !== prevStatus) {
      const now = new Date();
      if (newStatus === "in progress" && !activity.actual_start) {
        activity.actual_start = now;
      }
      // ... you already computed `now` and have `activity` (a subdoc in activities[])

      if (newStatus === "completed" && !activity.actual_finish) {
        if (!activity.actual_start) activity.actual_start = now;
        activity.actual_finish = now;

        if (Array.isArray(activity.dependency) && activity.dependency.length) {
          for (const dep of activity.dependency) {
            if (!Array.isArray(dep.status_history)) dep.status_history = [];
            dep.status_history.push({
              status: "allowed",
              remarks: "Auto-allowed on activity completion",
              updatedAt: now,
              user_id: req.user?.userId,
            });
          }
          const tasksPayloads = activity.dependency.map((dep) => {
            const isModuleTemplate = dep?.model === "moduleTemplates";
            const title = isModuleTemplate
              ? `${dep?.model_id_name}`
              : `PR for ${dep?.model_id_name}`;

            return {
              title,
              description: `Task generated for approved ${dep?.model_id_name}`,
              project_id: [projectActivity.project_id],
              userId: handover.submitted_by,
              sourceKey: `PA:${dep.model_id}:${activity._id}:${dep._id}`,
              source: {
                type: "projectActivityDependency",
                model_id: new mongoose.Types.ObjectId(dep.model_id),
                activityId: new mongoose.Types.ObjectId(activity._id),
                dependencyId: dep._id,
              },
            };
          });
          const tasks = await triggerTasksBulk(tasksPayloads);
          console.log({ tasks });
        }
      }

      // Update status history + current_status
      activity.status_history = activity.status_history || [];
      activity.status_history.push({
        status: newStatus,
        updated_at: now,
        updated_by: data.updated_by,
        remarks: data.remarks || "",
      });
    }

    /* -------- Planned fields & duration (legacy behavior) -------- */
    if (activity.planned_start && activity.planned_finish) {
      activity.duration =
        durationFromStartFinish(
          activity.planned_start,
          activity.planned_finish
        ) || activity.duration;
    } else if (activity.planned_start && activity.duration) {
      activity.planned_finish = finishFromStartAndDuration(
        activity.planned_start,
        activity.duration
      );
    } else if (activity.planned_finish && activity.duration) {
      const d = Math.max(1, Number(activity.duration) || 0);
      activity.planned_start = addDays(activity.planned_finish, -(d - 1));
    }

    /* -------- Mirror successors from predecessors & validate DAG -------- */
    rebuildSuccessorsFromPredecessors(projectActivityDoc.activities);

    const topo = topoSort(projectActivityDoc.activities);
    if (!topo.ok) {
      return res.status(400).json({
        message:
          "Dependency cycle detected. Please fix predecessors to maintain a DAG.",
      });
    }

    /* -------- Constraints for the changed activity -------- */
    const byId = new Map(
      projectActivityDoc.activities.map((a) => [String(a.activity_id), a])
    );

    const { minStart, minFinish, reasons } = computeMinConstraints(
      activity,
      byId,
      { useActuals }
    );

    if (
      minStart &&
      activity.planned_start &&
      isBefore(activity.planned_start, minStart)
    ) {
      return res.status(400).json({
        message:
          "Invalid planned_start for this dependency setup. It is earlier than allowed.",
        details: {
          required_min_start: minStart,
          provided_start: activity.planned_start,
          rules: reasons,
        },
      });
    }
    if (
      minFinish &&
      activity.planned_finish &&
      isBefore(activity.planned_finish, minFinish)
    ) {
      return res.status(400).json({
        message:
          "Invalid planned_finish for this dependency setup. It is earlier than allowed.",
        details: {
          required_min_finish: minFinish,
          provided_finish: activity.planned_finish,
          rules: reasons,
        },
      });
    }

    /* -------- Forward propagation (planned-only or actual-aware) -------- */
    propagateForwardAdjustments(
      activity.activity_id,
      projectActivityDoc.activities,
      { useActuals }
    );

    await projectActivityDoc.save();
    return res.status(200).json({ message: "Activity updated", activity });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

const getActivityInProject = async (req, res) => {
  try {
    const { projectId, activityId } = req.params;
    const projectActivityDoc = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectActivityDoc) {
      return res.status(404).json({ message: "Project not found" });
    }
    const activity = projectActivityDoc.activities.find(
      (act) => act.activity_id.toString() === activityId
    );
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    return res.status(200).json({ message: "Activity fetched", activity });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server error", error: error.message });
  }
};

const getAllTemplateNameSearch = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 7 } = req.query;
    const searchRegex =
      search && String(search).trim() !== ""
        ? new RegExp(String(search).trim().replace(/\s+/g, ".*"), "i")
        : null;
    const match = { status: "template" };

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 7, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    if (searchRegex) {
      match.$or = [
        { template_code: searchRegex },
        { name: searchRegex },
        { description: searchRegex },
      ];
    }

    const [templates, total] = await Promise.all([
      projectActivity
        .find(match)
        .select("template_code name description createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      projectActivity.countDocuments(match),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return res.status(200).json({
      ok: true,
      page: pageNum,
      limit: pageSize,
      total,
      totalPages,
      templates,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateProjectActivityFromTemplate = async (req, res) => {
  try {
    const { projectId, templateId } = req.params;
    const template = await projectActivity.findById(templateId);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    const projectActivityDoc = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectActivityDoc) {
      return res.status(404).json({ message: "Project activity not found" });
    }

    projectActivityDoc.activities = template.activities;
    await projectActivityDoc.save();
    return res.status(200).json({
      message: "Project activity updated from template successfully",
      projectActivityDoc,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateDependencyStatus = async (req, res) => {
  try {
    const { projectId, activityId, dependencyId } = req.params;
    const { status, remarks } = req.body;
    const projectactivityDoc = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectactivityDoc) {
      return res.status(404).json({ message: "Project Activity not found" });
    }
    const idx = (projectactivityDoc.activities || []).findIndex(
      (a) => String(a.activity_id) === String(activityId)
    );
    if (idx === -1) {
      return res.status(404).json({
        message: "Embedded activity not found in projectActivities.activities",
      });
    }
    const activity = projectactivityDoc.activities[idx];
    if (!activity) {
      return res.status(404).json({ message: "Activity not found in project" });
    }

    const dependency = activity.dependency.id(dependencyId);
    if (!dependency) {
      return res.status(404).json({ message: "Dependency not found" });
    }
    dependency.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
    });
    await projectactivityDoc.save();
    res.status(200).json({
      message: "Dependency status updated successfully",
      projectactivityDoc,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getRejectedOrNotAllowedDependencies = async (req, res) => {
  try {
    const { projectId, activityId } = req.params;

    if (
      !mongoose.isValidObjectId(projectId) ||
      !mongoose.isValidObjectId(activityId)
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid projectId or activityId (must be ObjectId)",
      });
    }

    const pid = new mongoose.Types.ObjectId(projectId);
    const aid = new mongoose.Types.ObjectId(activityId);

    const doc = await projectActivity
      .findOne(
        { project_id: pid, "activities.activity_id": aid },
        { project_id: 1, "activities.$": 1 }
      )
      .lean();

    if (!doc || !doc.activities?.length) {
      return res.status(404).json({
        ok: false,
        message: "Activity not found for this project",
      });
    }

    const act = doc.activities[0];

    // only deps whose status is "rejected" or "not allowed"
    const deps = (act.dependency || []).filter((dep) => {
      const s = String(dep?.current_status?.status || "")
        .trim()
        .toLowerCase();
      return s === "rejected" || s === "not allowed";
    });

    return res.status(200).json({
      ok: true,
      project_id: doc.project_id,
      activity_id: act.activity_id,
      count_dependencies: deps.length,
      dependencies: deps.map((d) => ({
        _id: d._id ?? null,
        model: d.model ?? null,
        model_id: d.model_id ?? null,
        model_id_name: d.model_id_name ?? null,
        current_status: d.current_status ?? null,
        status_history: d.status_history ?? [],
        updatedAt: d.updatedAt ?? null,
        updated_by: d.updated_by ?? null,
      })),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Internal Server Error",
      error: String(err?.message || err),
    });
  }
};

const getAllProjectActivityForView = async (req, res) => {
  try {
    // fetch all project activities
    const paDocs = await projectActivity.find({})
      .populate("project_id", "code name") 
      .populate("activities.activity_id", "name type")
      .lean();

    const data = paDocs.map((doc) => {
      const activities = (doc.activities || []).map((a) => {
        const planned = {
          start: a.planned_start || null,
          finish: a.planned_finish || null,
        };
        const actual = {
          start: a.actual_start || null,
          finish: a.actual_finish || null,
        };

        return {
          activity_id: a.activity_id?._id || a.activity_id || null,
          activity_name: a.activity_id?.name || "",
          planned,
          actual,
          bars: [
            { key: "planned", start: planned.start, finish: planned.finish, label: "Planned" },
            { key: "actual", start: actual.start, finish: actual.finish, label: "Actual" },
          ],
          percent_complete: a.percent_complete ?? null,
          status: a.current_status?.status || null,
          duration: a.duration ?? null,
          resources: a.resources ?? null,
        };
      });

      // compute overall min/max
      const allDates = [];
      for (const act of activities) {
        [act.planned.start, act.planned.finish, act.actual.start, act.actual.finish]
          .filter(Boolean)
          .forEach((d) => allDates.push(new Date(d).getTime()));
      }

      const date_min = allDates.length ? new Date(Math.min(...allDates)).toISOString() : null;
      const date_max = allDates.length ? new Date(Math.max(...allDates)).toISOString() : null;

      return {
        project_id: doc.project_id?._id || null,
        project_code: doc.project_id?.code || "",
        project_name: doc.project_id?.name || "",
        date_min,
        date_max,
        activities,
      };
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("getAllProjectActivityForView error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch project activities for view",
      error: error?.message || String(error),
    });
  }
};

module.exports = {
  createProjectActivity,
  getAllProjectActivities,
  editProjectActivity,
  deleteProjectActivity,
  updateProjectActivityStatus,
  getProjectActivitybyProjectId,
  pushActivityToProject,
  updateActivityInProject,
  getActivityInProject,
  getAllTemplateNameSearch,
  updateProjectActivityFromTemplate,
  updateDependencyStatus,
  nameSearchActivityByProjectId,
  getRejectedOrNotAllowedDependencies,
  reorderProjectActivities,
  getAllProjectActivityForView
};
