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
const projectactivitiesModel = require("../models/projectactivities.model");
const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");
const axios = require("axios");
const userModel = require("../models/user.model");

function stripTemplateCode(payload = {}) {
  const { template_code, ...rest } = payload;
  return rest;
}

const RESOURCE_TYPES = [
  "surveyor",
  "civil engineer",
  "civil i&c",
  "electric engineer",
  "electric i&c",
  "soil testing team",
  "tline engineer",
  "tline subcontractor",
];

const WINDOW_MAP = {
  "1w": 7,
  "2w": 14,
  "3w": 21,
  "1m": 30,
  "3m": 90,
  "6m": 180,
};

/* --------- date helpers --------- */
function startOfDayLocal(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function endOfDayLocal(d) {
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}
function ymd(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseYMDLocal(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  if (!y || !m || !d) return null;
  return startOfDayLocal(new Date(y, m - 1, d));
}

const createProjectActivity = async (req, res) => {
  try {
    const data = req.body;
    console.log(data.activities);
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
    const { status, remarks, assigned_status, assigned_to } = req.body;

    const projectactivity = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectactivity) {
      return res.status(404).json({ message: "Project activity not found" });
    }

    const activity = projectactivity.activities?.find(
      (act) => act.activity_id && act.activity_id.toString() === activityId
    );
    if (!activity) {
      return res.status(404).json({ message: "Activity not found in project" });
    }

    const toObjectId = (v) =>
      v ? new mongoose.Types.ObjectId(String(v)) : undefined;
    const toObjectIdArray = (arr) =>
      Array.isArray(arr)
        ? arr
            .map((x) => (x ? new mongoose.Types.ObjectId(String(x)) : null))
            .filter(Boolean)
        : [];

    const now = new Date();
    const actorId = toObjectId(req.user?.userId);

    const prevAssigned = Array.isArray(activity.assigned_to)
      ? activity.assigned_to.map(String)
      : [];

    const incomingAssigned =
      assigned_to === undefined
        ? undefined
        : Array.isArray(assigned_to)
          ? assigned_to
          : [assigned_to];

    const targetAssigned =
      incomingAssigned !== undefined
        ? incomingAssigned
        : assigned_status === "Removed"
          ? []
          : undefined;

    let assigned_added = [];
    let assigned_removed = [];
    let computedAssignedStatus;

    if (targetAssigned !== undefined) {
      const prevSet = new Set(prevAssigned);
      const nextSet = new Set((targetAssigned || []).map(String));

      for (const id of prevSet) if (!nextSet.has(id)) assigned_removed.push(id);
      for (const id of nextSet) if (!prevSet.has(id)) assigned_added.push(id);

      if (nextSet.size === 0) computedAssignedStatus = "Removed";
      else if (assigned_added.length > 0 && assigned_removed.length === 0)
        computedAssignedStatus = "Assigned";
      else if (assigned_added.length === 0 && assigned_removed.length === 0)
        computedAssignedStatus = undefined;
      else computedAssignedStatus = "Partial";
    }

    const assignmentChanged =
      targetAssigned !== undefined &&
      (assigned_added.length > 0 || assigned_removed.length > 0);

    const entry = {
      status,
      remarks,
      user_id: actorId,
      updated_at: now,

      ...(assignmentChanged ? { assigned_status: computedAssignedStatus } : {}),
      ...(assignmentChanged ? { assigned_by: actorId } : {}),
      ...(assignmentChanged
        ? { assigned_to: toObjectIdArray(targetAssigned) }
        : {}),

      assigned_added: assigned_added.length
        ? toObjectIdArray(assigned_added)
        : undefined,
      assigned_removed: assigned_removed.length
        ? toObjectIdArray(assigned_removed)
        : undefined,
    };

    Object.keys(entry).forEach(
      (k) => entry[k] === undefined && delete entry[k]
    );

    const statusChanged = status && activity.current_status?.status !== status;

    const hasMeaningfulUpdate =
      statusChanged || assignmentChanged || !!entry.remarks;

    if (!hasMeaningfulUpdate) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    activity.status_history = activity.status_history || [];
    activity.status_history.push(entry);

    if (assignmentChanged) {
      if (computedAssignedStatus !== undefined)
        activity.assigned_status = computedAssignedStatus;
      if (actorId) activity.assigned_by = actorId;
      activity.assigned_to = toObjectIdArray(targetAssigned);
    }

    if (status) {
      activity.current_status = {
        status,
        remarks,
        user_id: actorId,
        updated_at: now,
      };
    }

    if (status === "completed" && Array.isArray(activity.dependency)) {
      activity.dependency.forEach((dep) => {
        dep.status_history = dep.status_history || [];
        dep.status_history.push({
          status: "allowed",
          remarks: "Auto-updated to allowed as parent activity is completed",
          user_id: actorId,
          updatedAt: now,
        });
        dep.current_status = {
          status: "allowed",
          remarks: "Auto-updated to allowed as parent activity is completed",
          user_id: actorId,
          updatedAt: now,
        };
      });
    }

    await projectactivity.save();

    await projectactivity.populate([
      { path: "assigned_engineers", select: "name" },
      { path: "activities.status_history.user_id", select: "name" },
      { path: "activities.status_history.assigned_by", select: "name" },
      { path: "activities.status_history.assigned_to", select: "name" },
      { path: "activities.status_history.assigned_added", select: "name" },
      { path: "activities.status_history.assigned_removed", select: "name" },
      { path: "activities.assigned_by", select: "name" },
      { path: "activities.assigned_to", select: "name" },
    ]);

    const populated = projectactivity.toObject();

    for (const act of populated.activities || []) {
      for (const h of act.status_history || []) {
        h.user_name = h.user_id?.name ?? null;
        h.assigned_by_name = h.assigned_by?.name ?? null;
        h.assigned_to_names = Array.isArray(h.assigned_to)
          ? h.assigned_to.map((u) => u?.name ?? null)
          : [];
        h.assigned_added_names = Array.isArray(h.assigned_added)
          ? h.assigned_added.map((u) => u?.name ?? null)
          : [];
        h.assigned_removed_names = Array.isArray(h.assigned_removed)
          ? h.assigned_removed.map((u) => u?.name ?? null)
          : [];
      }
    }

    return res.status(200).json({
      message: "Status updated successfully",
      projectactivity: populated,
    });
  } catch (error) {
    console.error("updateProjectActivityStatus Error:", error);
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
      .populate("activities.dependency.updated_by", "name attachment_url")
      .populate("activities.status_history.user_id", "name attachment_url")
      .populate("activities.current_status.user_id", "name attachment_url")
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
          order: "$activities.order",
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
              project_id: projectActivityDoc.project_id,
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
          await triggerTasksBulk(tasksPayloads);
        }
      }
      if (prevStatus === "completed" && newStatus === "in progress") {
        activity.actual_finish = null;
        activity.actual_start = now;
        activity.dependency.forEach((dep) => {
          dep.status_history.push({
            status: "not allowed",
            remarks: "Auto updated as status changed to in progress",
            updatedAt: now,
            user_id: req.user?.userId,
          });
        });
      }

      activity.status_history = activity.status_history || [];
      activity.status_history.push({
        status: newStatus,
        updated_at: now,
        user_id: req.user.userId,
        remarks: data.remarks || "",
      });
    }
    if (newStatus === "not started") {
      activity.actual_finish = null;
      activity.actual_start = null;
      activity.dependency.forEach((dep) => {
        dep.status_history.push({
          status: "not allowed",
          remarks: "Auto updated as status changed to not started",
          updatedAt: new Date(),
          user_id: req.user?.userId,
        });
      });
    }

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

    rebuildSuccessorsFromPredecessors(projectActivityDoc.activities);

    const topo = topoSort(projectActivityDoc.activities);
    if (!topo.ok) {
      return res.status(400).json({
        message:
          "Dependency cycle detected. Please fix predecessors to maintain a DAG.",
      });
    }

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

    // 1) Load the doc and populate nested refs on the activities array
    const doc = await projectActivity
      .findOne({ project_id: projectId })
      .populate("activities.activity_id", "name description type")
      .populate("activities.current_status.user_id", "name attachment_url") // <-- name here
      .populate("activities.status_history.user_id", "name attachment_url") // (optional) also show names in history
      .populate("activities.dependency.updated_by", "name attachment_url") // (optional) if you show this in UI
      .lean();

    if (!doc) {
      return res.status(404).json({ message: "Project not found" });
    }

    // 2) Pick the single activity
    const acts = Array.isArray(doc.activities) ? doc.activities : [];

    // activityId you receive is the ObjectId of activities.activity_id
    const activity = acts.find((act) => {
      const id =
        (act.activity_id && act.activity_id._id) || act.activity_id || null;
      return String(id) === String(activityId);
    });

    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    // 3) Return populated activity (current_status.user_id will be { _id, name })
    return res.status(200).json({
      message: "Activity fetched",
      activity,
    });
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
    if (
      !mongoose.isValidObjectId(projectId) ||
      !mongoose.isValidObjectId(templateId)
    ) {
      return res
        .status(400)
        .json({ message: "Invalid projectId or templateId" });
    }

    const template = await projectActivity
      .findById(templateId)
      .select("-activities.actual_start -activities.actual_finish")
      .lean();

    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    const projectActivityDoc = await projectActivity
      .findOne({ project_id: projectId })
      .select("-activities.actual_start -activities.actual_finish");

    if (!projectActivityDoc) {
      return res.status(404).json({ message: "Project activity not found" });
    }

    const projectIds = (projectActivityDoc.activities || [])
      .map((a) => a.activity_id)
      .filter(Boolean);
    const templateIds = (template.activities || [])
      .map((a) => a.activity_id)
      .filter(Boolean);
    const allIds = [...new Set([...projectIds, ...templateIds])];

    const activityDocs = await activityModel
      .find({ _id: { $in: allIds } }, { _id: 1, type: 1 })
      .lean();
    const idToType = new Map(activityDocs.map((a) => [String(a._id), a.type]));

    const projectBackend = (projectActivityDoc.activities || []).filter(
      (pa) => idToType.get(String(pa.activity_id)) === "backend"
    );
    const projectBackendById = new Map(
      projectBackend.map((a) => [String(a.activity_id), a])
    );

    const templateBackend = (template.activities || []).filter(
      (ta) => idToType.get(String(ta.activity_id)) === "backend"
    );
    const templateBackendById = new Map(
      templateBackend.map((a) => [String(a.activity_id), a])
    );
    const templateFrontend = (template.activities || []).filter(
      (ta) => idToType.get(String(ta.activity_id)) === "frontend"
    );

    const sanitizeFromTemplate = (a) => {
      if (!a) return null;
      const {
        activity_id,
        order,
        planned_start,
        planned_finish,
        duration,
        percent_complete = 0,
        predecessors = [],
        successors = [],
        resources = [],
        dependency = [],
      } = a;
      return {
        activity_id,
        order,
        planned_start,
        planned_finish,
        duration,
        percent_complete,
        predecessors,
        successors,
        resources,
        dependency,
      };
    };
    const mergedFrontend = templateFrontend
      .map(sanitizeFromTemplate)
      .filter(Boolean);

    const updatedProjectBackend = projectBackend.map((projItem) => {
      const id = String(projItem.activity_id);
      const tmpl = templateBackendById.get(id);
      if (tmpl && Number.isFinite(tmpl.order)) {
        return {
          ...(projItem.toObject?.() ?? { ...projItem }),
          order: tmpl.order,
        };
      }
      return projItem;
    });

    const combined = [...updatedProjectBackend, ...mergedFrontend];

    combined.sort((a, b) => {
      const ao = Number.isFinite(a?.order) ? a.order : Number.MAX_SAFE_INTEGER;
      const bo = Number.isFinite(b?.order) ? b.order : Number.MAX_SAFE_INTEGER;
      return ao - bo;
    });

    projectActivityDoc.activities = combined;

    await projectActivityDoc.save();

    return res.status(200).json({
      message:
        "Updated from template: frontend copied from template; backend kept from project with only `order` updated where template also has that backend. No new backend added.",
      projectActivity: projectActivityDoc,
    });
  } catch (error) {
    console.error("updateProjectActivityFromTemplate error:", error);
    return res
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
    const { baselineStart, baselineEnd, filter: filterRaw } = req.query;

    const hasRange = Boolean(baselineStart && baselineEnd);
    let rangeStart = null,
      rangeEnd = null;
    if (hasRange) {
      rangeStart = new Date(baselineStart);
      rangeEnd = new Date(baselineEnd);
      if (isNaN(rangeStart) || isNaN(rangeEnd)) {
        return res.status(400).json({
          success: false,
          message: "Invalid baselineStart/baselineEnd",
        });
      }
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd.setHours(23, 59, 59, 999);
    }

    const filterKey = String(filterRaw || "")
      .toLowerCase()
      .replace("-", "_");
    const wantActualLate = filterKey === "actual_late";
    const wantActualOnTime = filterKey === "actual_ontime";
    const wantBaselineOnly = filterKey === "baseline";
    const filterSpecified =
      wantActualLate || wantActualOnTime || wantBaselineOnly;

    const match = hasRange
      ? {
          activities: {
            $elemMatch: {
              planned_start: { $lte: rangeEnd },
              planned_finish: { $gte: rangeStart },
            },
          },
        }
      : {};

    const paDocs = await projectActivity
      .find(match)
      .populate("project_id", "code name")
      .populate("activities.activity_id", "name type")
      .lean();

    const toYMD = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
    const overlapsPlanned = (a) =>
      a?.planned_start &&
      a?.planned_finish &&
      new Date(a.planned_start) <= rangeEnd &&
      new Date(a.planned_finish) >= rangeStart;

    const getDates = (a) => ({
      plannedStart: a.planned_start ? new Date(a.planned_start) : null,
      plannedFinish: a.planned_finish ? new Date(a.planned_finish) : null,
      actualStart: a.actual_start ? new Date(a.actual_start) : null,
      actualFinish: a.actual_finish ? new Date(a.actual_finish) : null,
    });

    const isActualLate = (a) => {
      const { plannedFinish, actualFinish } = getDates(a);
      if (!plannedFinish || !actualFinish) return false;
      return actualFinish.getTime() > plannedFinish.getTime();
    };

    const isActualOnTime = (a) => {
      const { plannedFinish, actualFinish } = getDates(a);
      if (!plannedFinish || !actualFinish) return false;
      return actualFinish.getTime() <= plannedFinish.getTime();
    };

    const data = paDocs
      .map((doc) => {
        const actsAfterRange = (doc.activities || []).filter((a) =>
          hasRange ? overlapsPlanned(a) : true
        );

        let actsAfterFilter = actsAfterRange;
        if (wantActualLate) {
          actsAfterFilter = actsAfterRange.filter(isActualLate);
        } else if (wantActualOnTime) {
          actsAfterFilter = actsAfterRange.filter(isActualOnTime);
        }

        const activities = actsAfterFilter.map((a) => {
          const plannedStart = a.planned_start || null;
          const plannedFinish = a.planned_finish || null;
          const actualStart = a.actual_start || null;
          const actualFinish = a.actual_finish || null;

          const statusRaw = a?.current_status?.status || null;
          const completed = Boolean(actualFinish) || statusRaw === "completed";

          if (wantBaselineOnly) {
            return {
              name: a.activity_id?.name || "",
              baselineStart: toYMD(plannedStart),
              baselineEnd: toYMD(plannedFinish),
              start: null,
              end: null,
              status: null,
            };
          }

          const shaped = {
            name: a.activity_id?.name || "",
            baselineStart: toYMD(plannedStart),
            baselineEnd: toYMD(plannedFinish),
            start: actualStart ? toYMD(actualStart) : null,
            end: actualFinish ? toYMD(actualFinish) : null,
            status: completed ? "done" : statusRaw || null,
          };

          if (typeof a.percent_complete === "number") {
            shaped.progress = Math.max(
              0,
              Math.min(1, a.percent_complete / 100)
            );
          }
          if (completed) shaped.completed = true;

          return shaped;
        });

        if ((hasRange || filterSpecified) && activities.length === 0)
          return null;

        return {
          project_code: doc.project_id?.code || "",
          project_name: doc.project_id?.name || "",
          activities,
        };
      })
      .filter(Boolean);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("getAllProjectActivityForView error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch project activities for view",
      error: error?.message || String(error),
    });
  }
};

const getResources = async (req, res) => {
  try {
    const { project_id } = req.query;
    const windowKey = String(
      req.query.window || req.query.preset || "1w"
    ).toLowerCase();
    const days = WINDOW_MAP[windowKey];
    if (!days) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid window. Use 1w,2w,3w,1m,3m,6m" });
    }

    const start = startOfDayLocal(new Date());
    const end = endOfDayLocal(addDays(start, days - 1));

    // optional filter by project
    const match = {};
    if (project_id) {
      if (!mongoose.isValidObjectId(project_id)) {
        return res
          .status(400)
          .json({ ok: false, message: "Invalid project_id" });
      }
      match.project_id = new mongoose.Types.ObjectId(project_id);
    }

    // Aggregate per day × type within [start..end], summing resources.number
    const rows = await projectActivity.aggregate([
      { $match: match },
      { $unwind: "$activities" },
      {
        $project: {
          planned_start: "$activities.planned_start",
          planned_finish: "$activities.planned_finish",
          resources: "$activities.resources",
        },
      },
      // keep only activities that overlap the forward window
      {
        $match: {
          planned_start: { $ne: null },
          planned_finish: { $ne: null },
          $expr: {
            $and: [
              { $lte: ["$planned_start", end] },
              { $gte: ["$planned_finish", start] },
            ],
          },
        },
      },
      // clamp overlap to [start..end]
      {
        $addFields: {
          overlapStart: {
            $cond: [
              { $gt: ["$planned_start", start] },
              "$planned_start",
              start,
            ],
          },
          overlapEnd: {
            $cond: [{ $lt: ["$planned_finish", end] }, "$planned_finish", end],
          },
        },
      },
      // number of days in overlap (inclusive)
      {
        $addFields: {
          daySpan: {
            $add: [
              1,
              {
                $dateDiff: {
                  startDate: {
                    $dateTrunc: { date: "$overlapStart", unit: "day" },
                  },
                  endDate: { $dateTrunc: { date: "$overlapEnd", unit: "day" } },
                  unit: "day",
                },
              },
            ],
          },
        },
      },
      { $match: { daySpan: { $gt: 0 } } },

      // explode resources array; only keep valid enum types
      { $unwind: { path: "$resources", preserveNullAndEmptyArrays: false } },
      { $match: { "resources.type": { $in: RESOURCE_TYPES } } },

      // ensure resources.number is numeric
      {
        $addFields: {
          resourcesNumber: {
            $convert: {
              input: "$resources.number",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
        },
      },

      // expand to each day in the overlap
      {
        $addFields: {
          activeDays: {
            $map: {
              input: { $range: [0, "$daySpan"] },
              as: "offset",
              in: {
                $dateTrunc: {
                  date: {
                    $dateAdd: {
                      startDate: {
                        $dateTrunc: { date: "$overlapStart", unit: "day" },
                      },
                      unit: "day",
                      amount: "$$offset",
                    },
                  },
                  unit: "day",
                },
              },
            },
          },
        },
      },
      { $unwind: "$activeDays" },

      // sum per (day,type)
      {
        $group: {
          _id: { day: "$activeDays", type: "$resources.type" },
          count: { $sum: "$resourcesNumber" },
        },
      },
      {
        $project: {
          _id: 0,
          day: "$_id.day",
          type: "$_id.type",
          count: { $ifNull: ["$count", 0] },
        },
      },
      { $sort: { day: 1 } },
    ]);

    const dayKeys = Array.from({ length: days }, (_, i) =>
      ymd(addDays(start, i))
    );
    const dense = {};
    for (const d of dayKeys)
      dense[d] = Object.fromEntries(RESOURCE_TYPES.map((t) => [t, 0]));

    for (const r of rows) {
      const k = ymd(r.day);
      if (dense[k]) dense[k][r.type] += Number(r.count) || 0;
    }

    const series = dayKeys.map((k) => ({ date: k, ...dense[k] }));

    return res.status(200).json({
      ok: true,
      mode: project_id ? "by-project (planned)" : "all-projects (planned)",
      window: { key: windowKey, days, ticks: 7 },
      ...(project_id ? { project_id } : {}),
      start: ymd(start),
      end: ymd(end),
      resource_types: RESOURCE_TYPES,
      series,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch resources by day",
      error: String(err?.message || err),
    });
  }
};

const updateStatusOfPlan = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, remarks } = req.body;
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    const projectactivitydoc = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectactivitydoc) {
      return res.status(404).json({ message: "Project Activity not found" });
    }
    projectactivitydoc.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
    });
    await projectactivitydoc.save();
    res.status(200).json({
      message: "Status of plan updated successfully",
      projectactivitydoc,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateProjectActivityForAllProjects = async (req, res) => {
  try {
    const allProjects = await projectModel.find({}, { _id: 1 }).lean();
    for (const proj of allProjects) {
      const existing = await projectActivity.findOne({
        project_id: proj._id,
      });
      if (!existing) {
        const activityDoc = await activityModel
          .find({}, { _id: 1, order: 1, dependency: 1, predecessors: 1 })
          .lean();

        const newDoc = new projectActivity({
          project_id: proj._id,
          activities: activityDoc.map((a) => ({
            activity_id: a._id,
            order: a.order || null,
            dependency: a.dependency || [],
            predecessors: a.predecessors || [],
            status_history: [],
          })),
          created_by: req.user.userId,
        });
        await newDoc.save();
      }
    }
    res
      .status(200)
      .json({ message: "Project activities ensured for all projects" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const syncActivitiesFromProjectActivity = async (req, res) => {
  try {
    const filter = {};

    const baseActsAll = await activityModel
      .find({}, { _id: 1, order: 1, dependency: 1 })
      .lean();

    const baseById = new Map(baseActsAll.map((a) => [String(a._id), a]));
    const allBaseIds = new Set(baseById.keys());

    const cursor = projectActivity
      .find(filter, { _id: 1, activities: 1 })
      .lean()
      .cursor();

    const BATCH_SIZE = 500;
    let ops = [];
    let processed = 0;
    let updatedDocs = 0;

    const isFiniteNumber = (v) => Number.isFinite(Number(v));
    for await (const paDoc of cursor) {
      processed += 1;

      const activitiesArr = Array.isArray(paDoc.activities)
        ? paDoc.activities
        : [];

      const now = new Date();
      let changed = false;

      const projectIdSet = new Set(
        activitiesArr
          .map((a) => a?.activity_id)
          .filter((id) => id && mongoose.isValidObjectId(id))
          .map((id) => String(id))
      );

      const updatedExisting = activitiesArr.map((projAct) => {
        const idStr = String(projAct.activity_id || "");
        const base = baseById.get(idStr);

        if (!base) return projAct; // base missing -> leave as-is

        const out = { ...projAct };

        // (a) order <- base.order
        if (isFiniteNumber(base.order)) {
          const newOrder = Number(base.order);
          if (out.order !== newOrder) {
            out.order = newOrder;
            changed = true;
          }
        }

        // (b) dependency <- base.dependency mapped to project schema
        const actDeps = Array.isArray(base.dependency) ? base.dependency : [];

        const isCompleted = out?.current_status?.status === "completed";
        const depStatus = isCompleted ? "allowed" : "not allowed";

        const newDeps = actDeps.map((d) => ({
          model: d?.model ?? undefined,
          model_id: d?.model_id ?? undefined,
          model_id_name: d?.model_id_name ?? undefined,
          updatedAt: now,
          updated_by: out?.current_status?.updated_by ?? undefined,
          status_history: [
            {
              status: depStatus,
              remarks: "Synced from activities model",
              updatedAt: now,
              user_id: out?.current_status?.updated_by ?? undefined,
            },
          ],
          current_status: {
            status: depStatus,
            remarks: "Synced from activities model",
            updatedAt: now,
            user_id: out?.current_status?.updated_by ?? undefined,
          },
        }));

        // Replace dependency (only field we’re changing besides order)
        out.dependency = newDeps;
        changed = true;

        return out;
      });

      // 3) ADD missing activities (exist in base but not in project)
      //    We add **only** minimal fields + dependency (not allowed), do NOT fill predecessors/etc.
      const newActivities = [];
      for (const baseId of allBaseIds) {
        if (projectIdSet.has(baseId)) continue; // already present
        const base = baseById.get(baseId);
        if (!base) continue;

        // Create a minimal project activity entry
        const baseOrder = isFiniteNumber(base.order)
          ? Number(base.order)
          : undefined;

        const deps = Array.isArray(base.dependency) ? base.dependency : [];
        const depMapped = deps.map((d) => ({
          model: d?.model ?? undefined,
          model_id: d?.model_id ?? undefined,
          model_id_name: d?.model_id_name ?? undefined,
          updatedAt: now,
          updated_by: undefined,
          status_history: [
            {
              status: "not allowed",
              remarks: "Added via sync (new activity in project)",
              updatedAt: now,
              user_id: undefined,
            },
          ],
          current_status: {
            status: "not allowed",
            remarks: "Added via sync (new activity in project)",
            updatedAt: now,
            user_id: undefined,
          },
        }));

        newActivities.push({
          activity_id: new mongoose.Types.ObjectId(baseId),
          order: baseOrder,
          planned_start: undefined,
          planned_finish: undefined,
          actual_start: undefined,
          actual_finish: undefined,
          duration: undefined,
          percent_complete: 0,
          predecessors: [],
          successors: [],
          resources: [],
          current_status: {
            status: "not started",
            updated_at: now,
            updated_by: undefined,
            remarks: "Added via sync",
          },
          status_history: [], // leave empty
          dependency: depMapped,
        });
      }

      if (newActivities.length > 0) {
        changed = true;
      }

      if (!changed) {
        continue;
      }

      const finalActivities = [...updatedExisting, ...newActivities];

      ops.push({
        updateOne: {
          filter: { _id: paDoc._id },
          update: { $set: { activities: finalActivities } },
        },
      });
      updatedDocs += 1;

      if (ops.length >= BATCH_SIZE) {
        await projectActivity.bulkWrite(ops, { ordered: false });
        ops = [];
      }
    }

    // Flush remaining ops
    if (ops.length > 0) {
      await projectActivity.bulkWrite(ops, { ordered: false });
    }

    return res.status(200).json({
      ok: true,
      message:
        "Synced order & dependency for all projectActivities; added missing activities from base model.",
      meta: { processedDocs: processed, updatedDocs },
    });
  } catch (error) {
    console.error("syncAllProjectActivities error:", error);
    return res.status(500).json({
      ok: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getProjectGanttChartCsv = async (req, res) => {
  try {
    let { projectId, type, timeline } = req.query;
    type = type === "site" ? "frontend" : type;

    const data = await projectactivitiesModel
      .findOne({ project_id: projectId })
      .populate([
        {
          path: "activities.activity_id",
          model: "activities",
          select: "name type",
        },
        {
          path: "activities.predecessors.activity_id",
          model: "activities",
          select: "name",
        },
        {
          path: "activities.successors.activity_id",
          model: "activities",
          select: "name",
        },
      ])
      .lean();

    if (
      !data ||
      !Array.isArray(data.activities) ||
      data.activities.length === 0
    ) {
      return res
        .status(404)
        .json({ message: "No activities found for this project." });
    }

    // Order
    data.activities.sort((a, b) => (a.order || 0) - (b.order || 0));

    const statusHelper = (
      plannedStart,
      plannedFinish,
      actualStart,
      actualFinish
    ) => {
      if (actualFinish) return "Completed";
      if (actualStart) return "In Progress";
      if (plannedStart || plannedFinish) return "Not Started";
      return "N/A";
    };

    // Normalize to date-only
    const toDateOnly = (d) => {
      if (!d) return null;
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      dt.setHours(0, 0, 0, 0);
      return dt;
    };

    const fmtDate = (d) =>
      d
        ? new Date(d).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "N/A";

    // Compute min start & max finish across planned
    let minStart = null;
    let maxFinish = null;
    for (const act of data.activities) {
      const ps = toDateOnly(act.planned_start);
      const pf = toDateOnly(act.planned_finish);
      if (ps && (!minStart || ps < minStart)) minStart = ps;
      if (pf && (!maxFinish || pf > maxFinish)) maxFinish = pf;
    }

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Project Schedule");

    // Base columns (fixed)
    const baseColumns = [
      { header: "S No.", key: "sno", width: 8 },
      { header: "Activity", key: "activity", width: 40 },
      { header: "Duration", key: "duration", width: 10 },
      { header: "Baseline Start", key: "bstart", width: 16 },
      { header: "Baseline End", key: "bend", width: 16 },
      { header: "Actual Start", key: "astart", width: 16 },
      { header: "Actual End", key: "aend", width: 16 },
      { header: "Activity Status", key: "status", width: 16 },
      { header: "Predecessors", key: "pred", width: 16 },
    ];

    // Build date columns (one per day) if we have a range
    const dateCols = [];
    if (minStart && maxFinish) {
      const cur = new Date(minStart);
      while (cur <= maxFinish) {
        dateCols.push({
          header: cur.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
          }), // 12-Oct
          key: `d_${cur.getFullYear()}_${String(cur.getMonth() + 1).padStart(2, "0")}_${String(cur.getDate()).padStart(2, "0")}`,
          dateObj: new Date(cur),
        });
        cur.setDate(cur.getDate() + 1);
      }
    }

    ws.columns = [
      ...baseColumns,
      ...dateCols.map((c) => ({ header: c.header, key: c.key, width: 5 })),
    ];

    // Optional title row: timeline range
    if (minStart && maxFinish) {
      ws.insertRow(1, [
        `Planned timeline: ${minStart.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })} → ${maxFinish.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}`,
      ]);
      ws.mergeCells(1, 1, 1, ws.columnCount);
      ws.getRow(1).font = { bold: true, size: 12 };
      ws.getRow(1).alignment = { horizontal: "center" };
    }

    // Header row styling
    const headerRowIdx = minStart && maxFinish ? 2 : 1;
    ws.getRow(headerRowIdx).font = { bold: true };
    ws.getRow(headerRowIdx).alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    ws.getRow(headerRowIdx).eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Freeze header + first two columns
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: headerRowIdx }];

    // Helpers
    const setGrid = (cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFBFBFBF" } },
        bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
        left: { style: "thin", color: { argb: "FFBFBFBF" } },
        right: { style: "thin", color: { argb: "FFBFBFBF" } },
      };
    };

    const fillGreen = (cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF92D050" },
      };
    };

    const fillRed = (cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF0000" },
      };
    };

    // --- helpers ---
    const getKey = (id) => id?._id?.toString?.() ?? id?.toString?.() ?? "";

    const predecessorHelper = (activities, mpp) => {
      if (!Array.isArray(activities) || activities.length === 0) return "";

      return activities
        .map((p) => {
          const k = getKey(p.activity_id);
          const order = mpp instanceof Map ? mpp.get(k) : mpp[k];
          const ordStr = Number.isFinite(order) ? String(order) : "?";
          const typeStr = p.type || "FS";
          const lagStr =
            Number.isFinite(p.lag) && p.lag !== 0 ? `+${p.lag}` : "";
          return `${ordStr}${typeStr}${lagStr}`;
        })
        .join(", ");
    };

    // --- build a stable mapping FIRST (first occurrence wins) ---
    const visible = data.activities.filter(
      (a) => type === "all" || a?.activity_id?.type === type
    );

    const mpp = new Map(); // activityId(string) -> 1-based visible index
    let seq = 0;
    for (const a of visible) {
      const k = getKey(a.activity_id);
      if (k && !mpp.has(k)) {
        seq += 1; // 1-based
        mpp.set(k, seq);
      }
    }

    // --- now render rows WITHOUT mutating mpp ---
    let count = 0;
    for (let idx = 0; idx < data.activities.length; idx++) {
      const act = data.activities[idx];
      if (type !== "all" && type !== act.activity_id?.type) continue;

      count += 1;

      const rowValues = {
        sno: count,
        activity: act.activity_id?.name || "NA",
        duration: act.duration ?? "N/A",
        bstart: fmtDate(act.planned_start),
        bend: fmtDate(act.planned_finish),
        astart: fmtDate(act.actual_start),
        aend: fmtDate(act.actual_finish),
        status: statusHelper(
          act.planned_start,
          act.planned_finish,
          act.actual_start,
          act.actual_finish
        ),
        pred: predecessorHelper(act.predecessors, mpp),
      };

      const topRow = ws.addRow(rowValues);
      const bottomRow = ws.addRow({});

      topRow.height = 12;
      bottomRow.height = 12;

      for (let c = 1; c <= baseColumns.length; c++) {
        ws.mergeCells(topRow.number, c, bottomRow.number, c);
        ws.getCell(topRow.number, c).alignment = { vertical: "middle" };
      }
      ws.getCell(topRow.number, 1).alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      const ps = toDateOnly(act.planned_start);
      const pf = toDateOnly(act.planned_finish);
      const as = toDateOnly(act.actual_start);
      const af = toDateOnly(act.actual_finish);

      for (let i = 0; i < dateCols.length; i++) {
        const colIdx = baseColumns.length + 1 + i;
        const d = dateCols[i].dateObj;

        const topCell = topRow.getCell(colIdx);
        const bottomCell = bottomRow.getCell(colIdx);

        setGrid(topCell);
        setGrid(bottomCell);

        if (ps && pf && d >= ps && d <= pf) fillGreen(topCell);
        if (timeline === "actual" && af && pf && af > pf && d > pf && d <= af) {
          fillRed(topCell);
        }
      }
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Project-Schedule.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getProjectSchedulePdf = async (req, res) => {
  try {
    let { projectId, type, timeline } = req.query;

    type = type === "site" ? "frontend" : type;

    const data = await projectactivitiesModel
      .findOne({ project_id: projectId })
      .populate([
        {
          path: "project_id",
          model: "projectDetail",
          select: "code name customer state",
        },
        {
          path: "activities.activity_id",
          model: "activities",
          select: "name type",
        },
        {
          path: "activities.predecessors.activity_id",
          model: "activities",
          select: "name",
        },
        {
          path: "activities.successors.activity_id",
          model: "activities",
          select: "name",
        },
      ])
      .lean();

    if (
      !data ||
      !Array.isArray(data.activities) ||
      data.activities.length === 0
    ) {
      return res
        .status(404)
        .json({ message: "No activities found for this project." });
    }

    data.activities.sort((a, b) => (a.order || 0) - (b.order || 0));

    const statusHelper = (
      plannedStart,
      plannedFinish,
      actualStart,
      actualFinish
    ) => {
      if (actualFinish) return "Completed";
      if (actualStart) return "In Progress";
      if (plannedStart || plannedFinish) return "Not Started";
      return "N/A";
    };

    const fmtDate = (d) =>
      d
        ? new Date(d).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "N/A";

    const getKey = (id) => id?._id?.toString?.() ?? id?.toString?.() ?? "";

    const predecessorHelper = (activities, mpp) => {
      if (!Array.isArray(activities) || activities.length === 0) return "";

      return activities
        .map((p) => {
          const k = getKey(p.activity_id);
          const order = mpp instanceof Map ? mpp.get(k) : mpp[k];
          const ordStr = Number.isFinite(order) ? String(order) : "?";
          const typeStr = p.type || "FS";
          const lagStr =
            Number.isFinite(p.lag) && p.lag !== 0 ? `+${p.lag}` : "";
          return `${ordStr}${typeStr}${lagStr}`;
        })
        .join(", ");
    };

    // --- build a stable mapping FIRST (first occurrence wins) ---
    const visible = data.activities.filter(
      (a) => type === "all" || a?.activity_id?.type === type
    );

    const mpp = new Map(); // activityId(string) -> 1-based visible index
    let seq = 0;
    for (const a of visible) {
      const k = getKey(a.activity_id);
      if (k && !mpp.has(k)) {
        seq += 1; // 1-based
        mpp.set(k, seq);
      }
    }

    const projectSchedule = visible.map((act, idx) => {
      return {
        sno: idx + 1,
        activity: act.activity_id?.name || "NA",
        duration: act.duration ?? "N/A",
        bstart: fmtDate(act.planned_start),
        bend: fmtDate(act.planned_finish),
        astart: fmtDate(act.actual_start),
        aend: fmtDate(act.actual_finish),
        status: statusHelper(
          act.planned_start,
          act.planned_finish,
          act.actual_start,
          act.actual_finish
        ),
        pred: predecessorHelper(act.predecessors, mpp),
      };
    });

    const apiUrl = `${process.env.PDF_PORT}/projects/project-schedule-pdf`;
    const axiosResponse = await axios({
      method: "POST",
      url: apiUrl,
      data: {
        customer: data.project_id.customer,
        state: data.project_id.state,
        project_code: data.project_id.code,
        project_name: data.project_id.name,
        data: projectSchedule,
      },
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    res.set({
      "Content-Type": axiosResponse.headers["content-type"],
      "Content-Disposition":
        axiosResponse.headers["content-disposition"] ||
        `attachment; filename="Project_Schedule.pdf"`,
    });

    axiosResponse.data.pipe(res);
  } catch (error) {
    console.error("PDF generation error:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateReorderfromActivity = async (req, res) => {
  try {
    const { projectId } = req.params;
    const activity = await activityModel.find().select("_id order").lean();
    const projectActivityDoc = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectActivityDoc) {
      return res.status(404).json({ message: "Project not found" });
    }
    const activityMap = new Map(activity.map((a) => [String(a._id), a.order]));
    projectActivityDoc.activities.forEach((act) => {
      const newOrder = activityMap.get(String(act.activity_id));
      if (Number.isFinite(newOrder) && act.order !== newOrder) {
        act.order = newOrder;
      }
    });
    await projectActivityDoc.save();
    return res.status(200).json({
      message: "Reorder updated from activity model",
      projectActivityDoc,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

// add dpr_role field to all users with empty string as default
// const addDprRole = async (req, res) => {
//   try {
//     // Add "dpr_role" field with empty string to all user documents
//     const result = await User.updateMany({}, { $set: { dpr_role: "" } });

//     return res.status(200).json({
//       message: "dpr_role key added successfully to all users.",
//       modifiedCount: result.modifiedCount,
//     });
//   } catch (error) {
//     console.error("Error adding dpr_role:", error);
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

const setAllUsersDprRole = async (req, res) => {
  try {
    const result = await userModel.updateMany(
      { department: "Projects", role: "executive" },
      { $set: { dpr_role: "Project-Engineer" } }
    );

    return res.status(200).json({
      message: "dpr_role updated to 'Project-Engineer' for matching users.",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating dpr_role:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

const getProjectUsers = async (req, res) => {
  try {
    const users = await userModel.find(
      {
        dpr_role: "Project-Engineer",
      },
      { name: 1, _id: 1 }
    );

    if (!users.length) {
      return res.status(404).json({ message: "No matching users found." });
    }

    return res.status(200).json({
      message: "Users fetched successfully.",
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error("Error fetching project users:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
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
  getAllProjectActivityForView,
  getResources,
  updateStatusOfPlan,
  updateProjectActivityForAllProjects,
  syncActivitiesFromProjectActivity,
  getProjectGanttChartCsv,
  getProjectSchedulePdf,
  updateReorderfromActivity,
  setAllUsersDprRole,
  getProjectUsers,
};
