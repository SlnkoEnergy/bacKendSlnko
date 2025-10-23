const DprActivities = require("../models/dpractivities.model");
const Activities = require("../models/activities.model");
const { default: mongoose } = require("mongoose");

const toId = (v) => new mongoose.Types.ObjectId(v);

const createDPR = async (req, res) => {
  try {
    const projectId = req.query.projectId;
    const { phase_1_engineers = [], phase_2_engineers = [] } = req.body;

    const created_by = req?.user?.userId;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "projectId is required in query.",
      });
    }

    const inputCount =
      (phase_1_engineers?.length || 0) + (phase_2_engineers?.length || 0);
    if (inputCount === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one entry in 'phase_1_engineers' or 'phase_2_engineers'.",
      });
    }

    const normalize = (arr, phaseLabel) => {
      const out = [];
      for (const it of arr || []) {
        if (!it?.activity_id || !it?.assigned_engineer) continue;
        out.push({
          phaseLabel,
          work: {
            activity_id: toId(it.activity_id),
            assigned_engineer: toId(it.assigned_engineer),
            work_status: it.work_status || "draft",
            work_completion:
              typeof it.work_completion === "number" ? it.work_completion : 0,
            assigned_status: it.assigned_status || "Assigned",
            remarks: it.remarks || "",
          },
        });
      }
      return out;
    };

    const p1 = normalize(phase_1_engineers, "phase_1");
    const p2 = normalize(phase_2_engineers, "phase_2");

    const seen = new Set();
    const dedupP1 = [];
    const dedupP2 = [];

    for (const { phaseLabel, work } of [...p1, ...p2]) {
      const key = `${phaseLabel}:${work.activity_id.toString()}:${work.assigned_engineer.toString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (phaseLabel === "phase_1") dedupP1.push(work);
      else dedupP2.push(work);
    }

    if (!dedupP1.length && !dedupP2.length) {
      return res.status(400).json({
        success: false,
        message:
          "No valid entries found after validation/deduplication. Check activity_id and assigned_engineer.",
      });
    }

    const newDpr = new DprActivities({
      project_id: toId(projectId),
      created_by,
      phase_1_engineers: dedupP1,
      phase_2_engineers: dedupP2,
      current_status: [],
      status_history: [],
    });

    const now = new Date();
    const pushStatusFor = (phaseLabel, work) => {
      const status = {
        updated_at: now,
        phase: phaseLabel,
        activity_id: work.activity_id,
        assigned_engineer: work.assigned_engineer,
        assigned_status: work.assigned_status,
        work_status: work.work_status,
        work_completion: work.work_completion,
        remarks: work.remarks || "",
      };
      newDpr.current_status.push(status);
      newDpr.status_history.push(status);
    };

    for (const w of dedupP1) pushStatusFor("phase_1", w);
    for (const w of dedupP2) pushStatusFor("phase_2", w);

    const savedDpr = await newDpr.save();

    return res.status(201).json({
      success: true,
      message: "DPR activities assigned successfully.",
      data: savedDpr,
    });
  } catch (error) {
    console.error("Error creating DPR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create DPR.",
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


const updateDPR = async (req, res) => {
  try {
    const projectId = req.query.projectId;
    const { phase_1_engineers = [], phase_2_engineers = [] } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "projectId is required in query.",
      });
    }


    const dpr = await DprActivities.findOne({ project_id: toId(projectId) });
    if (!dpr) {
      return res.status(404).json({
        success: false,
        message: "No DPR record found for this project.",
      });
    }


    const getStatus = (arr) => {
      if (arr.length === 0) return "Removed";
      if (arr.length > 0 && arr.length < 2) return "Partial";
      return "Assigned";
    };

    dpr.phase_1_engineers = phase_1_engineers.map((item) => ({
      activity_id: toId(item.activity_id),
      assigned_engineer: toId(item.assigned_engineer),
      work_status: item.work_status || "draft",
      work_completion: item.work_completion || 0,
      assigned_status: getStatus(phase_1_engineers),
      remarks: item.remarks || "",
    }));

    dpr.phase_2_engineers = phase_2_engineers.map((item) => ({
      activity_id: toId(item.activity_id),
      assigned_engineer: toId(item.assigned_engineer),
      work_status: item.work_status || "draft",
      work_completion: item.work_completion || 0,
      assigned_status: getStatus(phase_2_engineers),
      remarks: item.remarks || "",
    }));

    const now = new Date();
    dpr.current_status = [];
    dpr.status_history = [];

    const pushStatus = (phase, list) => {
      list.forEach((w) => {
        const s = {
          updated_at: now,
          phase,
          activity_id: w.activity_id,
          assigned_engineer: w.assigned_engineer,
          assigned_status: w.assigned_status,
          work_status: w.work_status,
          work_completion: w.work_completion,
          remarks: w.remarks || "",
        };
        dpr.current_status.push(s);
        dpr.status_history.push(s);
      });
    };

    pushStatus("phase_1", dpr.phase_1_engineers);
    pushStatus("phase_2", dpr.phase_2_engineers);

    const updated = await dpr.save();

    return res.status(200).json({
      success: true,
      message: "DPR updated successfully.",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating DPR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update DPR.",
      error: error.message,
    });
  }
};


module.exports = {
  createDPR,
  getAllActivities,
  updateDPR
};
