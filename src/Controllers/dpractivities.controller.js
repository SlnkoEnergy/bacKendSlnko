const DprActivities = require("../models/dpractivities.model");
const Activities = require("../models/activities.model");
const { default: mongoose } = require("mongoose");
const projectModel = require("../models/project.model");
const projectactivitiesModel = require("../models/projectactivities.model");
const activitiesModel = require("../models/activities.model");
const User = require("../models/user.model");

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

const getAllDPR = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize, 10) || 10));
    const search = (req.query.search || "").trim().toLowerCase();

    // 1) Latest DPR per project
    const latestPerProject = await DprActivities.aggregate([
      { $sort: { project_id: 1, createdAt: -1 } },
      {
        $group: {
          _id: "$project_id",
          dprId: { $first: "$_id" },
          project_id: { $first: "$project_id" },
          createdAt: { $first: "$createdAt" },
        },
      },
      { $project: { _id: 0, dprId: 1, project_id: 1, createdAt: 1 } },
    ]);

    if (!latestPerProject.length) {
      return res.json({
        success: true,
        message: "No DPRs found.",
        data: { page, pageSize, total: 0, rows: [] },
      });
    }

    const dprIds = latestPerProject.map((x) => x.dprId);
    const projIds = latestPerProject.map((x) => x.project_id.toString());

    // 2) Fetch DPRs (populate engineer name only)
    const dprs = await DprActivities
      .find({ _id: { $in: dprIds } })
      .populate([
  { path: "phase_1_engineers.assigned_engineer", model: User, select: "name" },
  { path: "phase_2_engineers.assigned_engineer", model: User, select: "name" },
])

      .lean();

    // 3) Project meta
    const projects = await projectModel
      .find({ _id: { $in: projIds } })
      .select("code name customer p_group")
      .lean();
    const projectMap = new Map(projects.map((p) => [p._id.toString(), p]));

    // 4) Collect (projectactivities_id, subdoc _id) pairs from both phases
    const collectPairs = (arr = []) =>
      arr
        .filter((w) => w?.projectactivities_id && w?.activity_id)
        .map((w) => ({
          paId: w.projectactivities_id.toString(),
          rowId: w.activity_id.toString(), // subdoc _id inside ProjectActivities.activities[]
        }));

    const pairs = [];
    for (const dpr of dprs) {
      pairs.push(...collectPairs(dpr.phase_1_engineers), ...collectPairs(dpr.phase_2_engineers));
    }

    const paIds = [...new Set(pairs.map((p) => p.paId))];

    // 5) Load all ProjectActivities docs (only activities array)
    const paDocs = paIds.length
      ? await projectactivitiesModel
          .find({ _id: { $in: paIds } })
          .select("activities")
          .lean()
      : [];

    // `${paId}:${rowSubId}` -> { activity_id, percent_complete, unit? }
    const paRowMap = new Map();
    for (const pa of paDocs) {
      const paId = pa._id.toString();
      for (const row of pa.activities || []) {
        if (!row?._id) continue;
        paRowMap.set(`${paId}:${row._id.toString()}`, {
          activity_id: row.activity_id ? row.activity_id.toString() : null, // -> Activities._id
          percent_complete:
            typeof row.percent_complete === "number" ? row.percent_complete : 0,
          unit: row.unit, // if you store unit on PA row
        });
      }
    }

    // 6) Load Activities to get names (and unit if stored there)
    const activityIds = new Set();
    for (const { paId, rowId } of pairs) {
      const meta = paRowMap.get(`${paId}:${rowId}`);
      if (meta?.activity_id) activityIds.add(meta.activity_id);
    }

    const actDocs = activityIds.size
      ? await Activities.find({ _id: { $in: [...activityIds] } }).select("name unit").lean()
      : [];
    const actMap = new Map(actDocs.map((a) => [a._id.toString(), a]));

    // 7) Shape -> flat rows (with project meta)
    const shapeRow = (project, phase, w) => {
      const paId = w?.projectactivities_id ? w.projectactivities_id.toString() : "";
      const rowId = w?.activity_id ? w.activity_id.toString() : "";
      const paMeta = paRowMap.get(`${paId}:${rowId}`) || {};
      const act = paMeta.activity_id ? actMap.get(paMeta.activity_id) : null;

      const unit = (paMeta.unit ?? act?.unit) || "";

      return {
        project_id: project?._id || null,
        project_code: project?.code || "",
        project_name: project?.name || "",
        project_customer: project?.customer || "",
        project_p_group: project?.p_group || "",

        phase, // "phase_1" | "phase_2"

        activity: {
          _id: paMeta.activity_id || null, // Activities._id
          name: act?.name || "",
          unit,
        },

        percent_complete:
          typeof paMeta.percent_complete === "number" ? paMeta.percent_complete : 0,

        engineer: {
          _id: w.assigned_engineer?._id || w.assigned_engineer || null,
          name: w.assigned_engineer?.name || "",
        },

        assigned_status: w.assigned_status || "Assigned",
        work_status: w.work_status || "draft",
        work_completion:
          typeof w.work_completion === "number" ? w.work_completion : 0,
        remarks: w.remarks || "",
      };
    };

    let allRows = [];
    for (const dpr of dprs) {
      const proj = projectMap.get(dpr.project_id?.toString() || "");
      const p1 = (dpr.phase_1_engineers || []).map((w) => shapeRow(proj, "phase_1", w));
      const p2 = (dpr.phase_2_engineers || []).map((w) => shapeRow(proj, "phase_2", w));
      allRows.push(...p1, ...p2);
    }

    // 8) Search: engineer, activity, project meta
    const matches = (row) => {
      if (!search) return true;
      return (
        (row.engineer.name || "").toLowerCase().includes(search) ||
        (row.activity.name || "").toLowerCase().includes(search) ||
        (row.project_code || "").toLowerCase().includes(search) ||
        (row.project_name || "").toLowerCase().includes(search) ||
        (row.project_customer || "").toLowerCase().includes(search)
      );
    };
    const filtered = allRows.filter(matches);

    // 9) Pagination
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const rows = filtered.slice(start, end);

    return res.json({
      success: true,
      message: "Latest DPRs across all projects fetched.",
      data: { page, pageSize, total, rows },
    });
  } catch (error) {
    console.error("Error fetching all DPRs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch all DPRs.",
      error: error.message,
    });
  }
};



module.exports = {
  createDPR,
  getAllActivities,
  updateDPR,
  getAllDPR
};
