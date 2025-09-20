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
    const projectactivity = await projectActivity.findOne({project_id: projectId});
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
    
    if(status === 'completed') {
       activity.dependency.forEach(dep => {
          dep.status_history = dep.status_history || [];
          dep.status_history.push({
            status: 'allowed',
            remarks: 'Auto-updated to allowed as parent activity is completed',
            user_id: req.user.userId,
            updatedAt: new Date()
          });
    })
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
    const projectactivity = await projectActivity
      .findOne({ project_id: projectId })
      .populate("activities.activity_id", "name description type")
      .populate("created_by", "name")
      .populate(
        "project_id",
        "code project_completion_date ppa_expiry_date bd_commitment_date remaining_days"
      );
    if (!projectactivity) {
      return res.status(404).json({ message: "Project activity not found" });
    }
    return res.status(200).json({
      message: "Project activity fetched successfully",
      projectactivity,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
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
        updated_by: req.user.userId,
      })),
    });

    const activity_id = activity._id;

    const projectactivity = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectactivity) {
      return res.status(404).json({ message: "Project activity not found" });
    }
    projectactivity.activities.push({ activity_id });
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

    const projectActivityDoc = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectActivityDoc) {
      return res.status(404).json({ message: "Project not found" });
    }

    const activityIdObj = new mongoose.Types.ObjectId(activityId);
    const activity = projectActivityDoc.activities.find((act) =>
      act.activity_id.equals(activityIdObj)
    );
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    // --- Normalize links from request ---
    const allowedLinkTypes = new Set(["FS", "SS", "FF"]);
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
          type: allowedLinkTypes.has(p.type) ? p.type : "FS",
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
          type: allowedLinkTypes.has(p.type) ? p.type : "FS",
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

    const { predecessors, successors, ...rest } = data || {};
    Object.assign(activity, rest);

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
      byId
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
      projectActivityDoc.activities
    );

    if (data.status) {
      const now = new Date();
      const statusEntry = {
        status: data.status,
        updated_at: now,
        updated_by: data.updated_by,
        remarks: data.remarks || "",
      };
      activity.status_history = activity.status_history || [];
      activity.status_history.push(statusEntry);
    }

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
      return res
        .status(404)
        .json({
          message:
            "Embedded activity not found in projectActivities.activities",
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
    res
      .status(200)
      .json({
        message: "Dependency status updated successfully",
        projectactivityDoc,
      });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const isAllowedDependency = async(req, res) => {
  try {
    
  } catch (error) {
    
  }
}

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
};
