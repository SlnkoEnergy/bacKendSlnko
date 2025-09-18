const projectActivity = require("../models/projectactivities.model");
const activityModel = require("../models/activities.model");

const createProjectActivity = async (req, res) => {
  try {
    const data = req.body;
    const projectacitvity = new projectActivity({
      ...data,
      created_by: req.user.userId,
    });
    await projectacitvity.save();
    res
      .status(201)
      .json({ message: "Activity created successfully", acitvity });
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
      .populate("project_id", "code project_completion_date completion_date bd_commitment_date remaining_days")
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
    res
      .status(200)
      .json({
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

    const projectActivity = await projectActivity.findOne({ project_id: projectId });
    if (!projectActivity) {
      return res.status(404).json({ message: "Project not found" });
    }

    const activity = projectActivity.activities.find(
      (act) => act.activity_id.toString() === activityId
    );
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    Object.assign(activity, data);

    if (data.status) {
      const statusEntry = {
        status: data.status,
        updated_at: new Date(),
        updated_by: data.updated_by,
        remarks: data.remarks || "",
      };
      activity.status_history.push(statusEntry);
    }

    await projectActivity.save();
    return res.status(200).json({ message: "Activity updated", activity });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createProjectActivity,
  editProjectActivity,
  deleteProjectActivity,
  updateProjectActivityStatus,
  getProjectActivitybyProjectId,
  pushActivityToProject,
  updateActivityInProject
};
