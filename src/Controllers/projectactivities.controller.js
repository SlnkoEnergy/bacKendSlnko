const projectActivity = require("../models/projectactivities.model");
const activityModel = require("../models/activities.model");
const { default: mongoose } = require("mongoose");
const {
  rebuildSuccessorsFromPredecessors,
  topoSort,
  computeMinConstraints,
  isBefore,
  propagateForwardAdjustments,
  durationFromStartFinish,
} = require("../utils/predecessor.utils");

const createProjectActivity = async (req, res) => {
  try {
    const data = req.body;
    const projectactivityDoc = new projectActivity({
      ...data,
      created_by: req.user.userId,
    });
    await projectactivityDoc.save();
    res
      .status(201)
      .json({ message: "Activity created successfully", projectactivityDoc });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const editProjectActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const projectactivity = await projectActivity.findByIdAndUpdate(id, data, {
      new: true,
    });
    if (!projectactivity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    res
      .status(200)
      .json({ message: "Activity updated successfully", projectactivity });
  } catch (error) {
    res
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
    res.status(200).json({ message: "Activity deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateProjectActivityStatus = async (req, res) => {
  try {
    const { id, activityId } = req.params;
    const { status, remarks } = req.body;
    const projectactivity = await projectActivity.findById(id);
    if (!projectactivity) {
      return res.status(404).json({ message: "Project activity not found" });
    }

    const activity = projectactivity.activities?.find(
      (act) => act._id.toString() === activityId
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

    await projectactivity.save();
    res
      .status(200)
      .json({ message: "Status updated successfully", projectactivity });
  } catch (error) {
    res
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
        "code project_completion_date completion_date bd_commitment_date remaining_days"
      );
    if (!projectactivity) {
      return res.status(404).json({ message: "Project activity not found" });
    }
    res.status(200).json({
      message: "Project activity fetched successfully",
      projectactivity,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
const pushActivityToProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description, type } = req.body;

    const activity = await activityModel.create({
      name,
      description,
      type,
      created_by: req.user.userId,
    });
    await activity.save();

    const activity_id = activity._id;

    const projectactivity = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectactivity) {
      return res.status(404).json({ message: "Project activity not found" });
    }
    projectactivity.activities.push({ activity_id });
    await projectactivity.save();
    res.status(200).json({
      message: "Activity added to project successfully",
      projectactivity,
    });
  } catch (error) {
    res
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
      const statusEntry = {
        status: data.status,
        updated_at: new Date(),
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

module.exports = {
  createProjectActivity,
  editProjectActivity,
  deleteProjectActivity,
  updateProjectActivityStatus,
  getProjectActivitybyProjectId,
  pushActivityToProject,
  updateActivityInProject,
  getActivityInProject,
};
