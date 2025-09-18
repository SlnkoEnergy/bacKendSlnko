const projectActivity = require("../models/projectactivities.model");
const activityModel = require("../models/activities.model");
const { default: mongoose } = require("mongoose");
const { applyPredecessorLogic } = require("../utils/predecessor.utils");

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

    Object.assign(activity, data);

    // --- Link predecessors <-> successors ---
    if (Array.isArray(data.predecessors)) {
      data.predecessors.forEach((predLink) => {
        const predActivity = projectActivityDoc.activities.find((a) =>
          a.activity_id.equals(predLink.activity_id)
        );
        if (predActivity) {
          const alreadyLinked = predActivity.successors?.some(
            (s) => s.activity_id.equals(activityIdObj)
          );
          if (!alreadyLinked) {
            predActivity.successors = predActivity.successors || [];
            predActivity.successors.push({
              activity_id: activityIdObj,
              type: predLink.type,
              lag: predLink.lag || 0,
            });
          }
        }
      });
    }

    if (Array.isArray(data.successors)) {
      data.successors.forEach((succLink) => {
        const succActivity = projectActivityDoc.activities.find((a) =>
          a.activity_id.equals(succLink.activity_id)
        );
        if (succActivity) {
          const alreadyLinked = succActivity.predecessors?.some(
            (p) => p.activity_id.equals(activityIdObj)
          );
          if (!alreadyLinked) {
            succActivity.predecessors = succActivity.predecessors || [];
            succActivity.predecessors.push({
              activity_id: activityIdObj,
              type: succLink.type,
              lag: succLink.lag || 0,
            });
          }
        }
      });
    }

    applyPredecessorLogic(projectActivityDoc.activities, activity);

    if (data.status) {
      const statusEntry = {
        status: data.status,
        updated_at: new Date(),
        updated_by: data.updated_by,
        remarks: data.remarks || "",
      };
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
    const projectActivity = await projectActivity.findOne({
      project_id: projectId,
    });
    if (!projectActivity) {
      return res.status(404).json({ message: "Project not found" });
    }
    const activity = projectActivity.activities.find(
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
