const DprActivities = require("../models/dpractivities.model");
const Activities = require("../models/activities.model");

const createDPR = async (req, res) => {
  try {
    const { projectId, activity, assignments } = req.body;
    const created_by = req.user?._id;

    if (!projectId || !assignments?.length) {
      return res.status(400).json({
        success: false,
        message: "projectId and assignments are required",
      });
    }

    const newDpr = new DprActivities({
      project_id: new mongoose.Types.ObjectId(projectId),
      created_by,
      phase_1_engineers: [],
      phase_2_engineers: [],
      current_status: [],
      status_history: [],
    });

    for (const assign of assignments) {
      const { phase, phaseActivities = [], engineers = [] } = assign;
      if (!phase || !phaseActivities.length || !engineers.length) continue;

      for (const actId of phaseActivities) {
        for (const engId of engineers) {
          const workEntry = {
            activity_id: new mongoose.Types.ObjectId(actId),
            assigned_engineer: new mongoose.Types.ObjectId(engId),
            work_status: "draft",
            work_completion: 0,
            assigned_status: "Assigned",
            remarks: "",
          };

          // Push inside correct phase array
          if (phase === "phase1") newDpr.phase_1_engineers.push(workEntry);
          if (phase === "phase2") newDpr.phase_2_engineers.push(workEntry);

          // For tracking
          const statusObj = {
            updated_at: new Date(),
            phase: phase === "phase1" ? "phase_1" : "phase_2",
            activity_id: workEntry.activity_id,
            assigned_engineer: workEntry.assigned_engineer,
            assigned_status: "Assigned",
            work_status: "draft",
            work_completion: 0,
            remarks: "",
          };

          newDpr.current_status.push(statusObj);
          newDpr.status_history.push(statusObj);
        }
      }
    }

    const savedDpr = await newDpr.save();

    res.status(201).json({
      success: true,
      message: "DPR activities assigned successfully",
      data: savedDpr,
    });
  } catch (error) {
    console.error("Error creating DPR:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create DPR",
      error: error.message,
    });
  }
};

const getAllActivities = async (req, res) => {
  try {
    const activities = await Activities.find(
      {},
      { _id: 1, name: 1, order: 1 }
    ).lean();

    res.status(200).json({
      success: true,
      count: activities.length,
      data: activities,
    });
  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activities",
      error: error.message,
    });
  }
};

module.exports = {
  createDPR,
  getAllActivities,
};
