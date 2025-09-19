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

// const projectActivity = require("..."); // your existing import

// --- helpers ---
function addDays(date, days) {
  if (!date) return null;
  const d = new Date(date);
  d.setDate(d.getDate() + (Number(days) || 0));
  return d;
}
function isBefore(a, b) {
  return a && b && new Date(a).getTime() < new Date(b).getTime();
}
function isAfter(a, b) {
  return a && b && new Date(a).getTime() > new Date(b).getTime();
}

/**
 * Build adjacency lists from predecessors array of each activity
 * Returns { adjOut, indeg, byId }
 */
function buildGraph(activities) {
  const byId = new Map();
  activities.forEach((a) => byId.set(String(a.activity_id), a));

  const adjOut = new Map(); // u -> [{v, type, lag}]
  const indeg = new Map();
  activities.forEach((a) => {
    const u = String(a.activity_id);
    indeg.set(u, 0);
    adjOut.set(u, []);
  });

  activities.forEach((a) => {
    const v = String(a.activity_id);
    (a.predecessors || []).forEach((p) => {
      const u = String(p.activity_id);
      if (!byId.has(u)) return;
      adjOut.get(u).push({ v, type: p.type, lag: Number(p.lag) || 0 });
      indeg.set(v, (indeg.get(v) || 0) + 1);
    });
  });

  return { adjOut, indeg, byId };
}

/** Kahn topo sort + cycle detection */
function topoSort(activities) {
  const { adjOut, indeg } = buildGraph(activities);
  const q = [];
  indeg.forEach((deg, node) => {
    if (deg === 0) q.push(node);
  });
  const order = [];
  while (q.length) {
    const u = q.shift();
    order.push(u);
    (adjOut.get(u) || []).forEach(({ v }) => {
      indeg.set(v, indeg.get(v) - 1);
      if (indeg.get(v) === 0) q.push(v);
    });
  }
  // cycle if not all visited
  const total = indeg.size;
  if (order.length !== total) {
    return { ok: false, order };
  }
  return { ok: true, order };
}

/**
 * Compute minimum allowed planned_start / planned_finish for an activity
 * based on its predecessors and link type (FS/SS/FF) with lag in days.
 *
 * Returns { minStart: Date|null, minFinish: Date|null, reasons: string[] }
 */
function computeMinConstraints(activity, byId) {
  let minStart = null;
  let minFinish = null;
  const reasons = [];

  (activity.predecessors || []).forEach((link) => {
    const pred = byId.get(String(link.activity_id));
    if (!pred) return;
    const type = link.type;
    const lag = Number(link.lag) || 0;

    if (type === "FS") {
      // successor.start >= pred.finish + lag
      if (pred.planned_finish) {
        const req = addDays(pred.planned_finish, lag);
        if (!minStart || isAfter(req, minStart)) minStart = req;
        reasons.push(
          `FS: start ≥ finish(${pred.activity_id}) + ${lag}d → ${req.toDateString()}`
        );
      }
    } else if (type === "SS") {
      // successor.start >= pred.start + lag
      if (pred.planned_start) {
        const req = addDays(pred.planned_start, lag);
        if (!minStart || isAfter(req, minStart)) minStart = req;
        reasons.push(
          `SS: start ≥ start(${pred.activity_id}) + ${lag}d → ${req.toDateString()}`
        );
      }
    } else if (type === "FF") {
      // successor.finish >= pred.finish + lag
      if (pred.planned_finish) {
        const req = addDays(pred.planned_finish, lag);
        if (!minFinish || isAfter(req, minFinish)) minFinish = req;
        reasons.push(
          `FF: finish ≥ finish(${pred.activity_id}) + ${lag}d → ${req.toDateString()}`
        );
      }
    }
  });

  return { minStart, minFinish, reasons };
}

/** Rebuild successors array purely from predecessors (do not trust input successors) */
function rebuildSuccessorsFromPredecessors(activities) {
  const map = new Map();
  activities.forEach((a) => {
    map.set(String(a.activity_id), []);
  });
  activities.forEach((a) => {
    (a.predecessors || []).forEach((p) => {
      const predId = String(p.activity_id);
      if (!map.has(predId)) return;
      const list = map.get(predId);
      // de-dup on activity_id
      if (!list.some((s) => String(s.activity_id) === String(a.activity_id))) {
        list.push({ activity_id: a.activity_id, type: p.type, lag: p.lag || 0 });
      }
    });
  });
  // assign
  activities.forEach((a) => {
    a.successors = map.get(String(a.activity_id));
  });
}

// --- Controller ---
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

    // --- Only accept predecessors; ignore any incoming successors per requirement ---
    const allowedLinkTypes = new Set(["FS", "SS", "FF"]); // SF disabled
    let incomingPreds = Array.isArray(data.predecessors) ? data.predecessors : null;
    let incomingSuccs = Array.isArray(data.successors) ? data.successors : null

    if (incomingPreds) {
      // sanitize: strip SF, normalize lag, dedupe by activity_id
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

      // set on the target activity
      activity.predecessors = incomingPreds;
    }
    
    console.log({incomingSuccs})

    if (incomingSuccs) {
      // sanitize: strip SF, normalize lag, dedupe by activity_id
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

      // set on the target activity
      activity.successors = incomingSuccs;
    }

    // apply simple scalar updates (but do not overwrite predecessors/successors from data.successors)
    // You can whitelist allowed fields; keeping your Object.assign style but protecting arrays we control.
    const { predecessors, successors, ...rest } = data || {};
    Object.assign(activity, rest);

    // --- Rebuild successors for ALL activities from their predecessors ---
    rebuildSuccessorsFromPredecessors(projectActivityDoc.activities);

    // --- Topological sort & cycle check (build graph from predecessors only) ---
    const topo = topoSort(projectActivityDoc.activities);
    if (!topo.ok) {
      return res.status(400).json({
        message:
          "Dependency cycle detected. Please fix predecessors to maintain a DAG.",
      });
    }

    // --- Validate date constraints for the CURRENT activity only (block invalid user input) ---
    // Build byId map for constraint calc
    const byId = new Map(
      projectActivityDoc.activities.map((a) => [String(a.activity_id), a])
    );

    const { minStart, minFinish, reasons } = computeMinConstraints(activity, byId);

    // If user provided planned_start/finish, block if violating constraints.
    if (minStart && activity.planned_start && isBefore(activity.planned_start, minStart)) {
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
    if (minFinish && activity.planned_finish && isBefore(activity.planned_finish, minFinish)) {
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

    // Optionally: if duration is provided and only start changed, you might auto-set finish = start + duration
    // Leaving behavior unchanged unless you want it:
    // if (activity.duration && activity.planned_start && !activity.planned_finish) {
    //   activity.planned_finish = addDays(activity.planned_start, activity.duration);
    // }

    // --- Status history append (unchanged) ---
    if (data.status) {
      const statusEntry = {
        status: data.status,
        updated_at: new Date(),
        updated_by: data.updated_by,
        remarks: data.remarks || "",
      };
      activity.status_history = activity.status_history || [];
      activity.status_history.push(statusEntry);
      // keep current_status in sync if you want (optional)
      activity.current_status = {
        status: data.status,
        updated_at: new Date(),
        updated_by: data.updated_by,
        remarks: data.remarks || "",
      };
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
