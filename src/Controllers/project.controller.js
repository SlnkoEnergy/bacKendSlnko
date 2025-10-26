const projectModells = require("../models/project.model");
const handoversheetModells = require("../models/handoversheet.model");
const projectactivitiesModel = require("../models/projectactivities.model");
const { default: mongoose } = require("mongoose");
const activitiesModel = require("../models/activities.model");
const postsModel = require("../models/posts.model");
const userModells = require("../models/user.model")

const createProject = async function (req, res) {
  try {
    const {
      customer,
      name,
      p_group,
      email,
      number,
      alt_number,
      billing_address,
      site_address,
      state,
      project_category,
      project_kwp,
      distance,
      tarrif,
      land,
      code,
      project_status,
      updated_on,
      service,
      submitted_by,
      billing_type,
    } = req.body;

    const lastProject = await projectModells
      .findOne()
      .sort({ p_id: -1 })
      .exec();
    const newPId = lastProject ? parseInt(lastProject.p_id, 10) + 1 : 1;

    const checkProject = await projectModells.findOne({ code: code });
    {
      if (checkProject) {
        return res.status(400).json({ msg: "Project code already exists!" });
      }
    }
    // Create a new project instance
    const newProject = new projectModells({
      p_id: newPId.toString().padStart(6, "0"),
      customer,
      name,
      p_group,
      email,
      number,
      alt_number,

      billing_address,
      site_address,
      state,
      project_category,
      project_kwp,
      distance,
      tarrif,
      land,
      code,
      project_status,
      updated_on,
      service,
      submitted_by,
      billing_type,
    });

    // Save the project to the database
    await newProject.save();

    // Respond with success message and the saved data
    return res
      .status(201)
      .json({ msg: "Project details saved successfully!", data: newProject });
  } catch (error) {
    console.error("Error saving project details:", error);
    return res
      .status(500)
      .json({ msg: "Failed to save project details.", error: error.message });
  }
};

//update project
const updateProject = async function (req, res) {
  const { _id } = req.params;
  const updateData = req.body;

  // Validate input
  if (!_id) {
    return res.status(400).json({ msg: "Project ID is required." });
  }

  if (!updateData || Object.keys(updateData).length === 0) {
    return res.status(400).json({ msg: "No update data provided." });
  }

  try {
    // Find and update the project
    const updatedProject = await projectModells.findByIdAndUpdate(
      _id,
      updateData,
      {
        new: true, // Return the updated document
        runValidators: true, // Ensure validation rules are applied
      }
    );

    if (!updatedProject) {
      return res.status(404).json({ msg: "Project not found." });
    }

    // Respond with the updated project data
    res.status(200).json({
      msg: "Project updated successfully",
      data: updatedProject,
    });
  } catch (error) {
    // Catch and handle any errors
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

//delete by id
const deleteProjectById = async function (req, res) {
  try {
    const id = req.params._id;
    const deletedProject = await projectModells.findByIdAndDelete(id);

    if (!deletedProject) {
      return res.status(404).json({ msg: "Project not found!" });
    }

    res.status(200).json({ msg: "Project deleted successfully!" });
  } catch (error) {
    res
      .status(500)
      .json({ msg: "Error deleting project", error: error.message });
  }
};

//view all project
const getallproject = async function (req, res) {
  try {
    const projects = await projectModells.find();

    const updatedProjects = await Promise.all(
      projects.map(async (project) => {
        const isHandoverPresent = await handoversheetModells.exists({
          p_id: project.p_id,
        });
        return {
          ...project.toObject(),
          handover: !!isHandoverPresent,
        };
      })
    );

    res.status(200).json({ msg: "All Project", data: updatedProjects });
  } catch (error) {
    res
      .status(500)
      .json({ msg: "Internal Server Error", error: error.message });
  }
};

const getAllProjects = async (req, res) => {
  try {
    const {
      page = "1",
      limit = "10",
      search = "",
      status,
      sort = "-createdAt",
    } = req.query;

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (p - 1) * l;

    const query = {};
    if (status && status.toLowerCase() !== "all") {
      query["current_status.status"] = status;
    }

    if (search && String(search).trim() !== "") {
      const safe = String(search)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");

      const or = [{ code: rx }, { name: rx }, { description: rx }];

      if (mongoose.isValidObjectId(search)) {
        or.push({ _id: new mongoose.Types.ObjectId(search) });
      }
      query.$or = or;
    }

    // choose fields to return
    const projection =
      "code name customer state project_kwp dc_capacity current_status project_completion_date ppa_expiry_date bd_commitment_date remaining_days";

    // run query + count in parallel
    const [items, total] = await Promise.all([
      projectModells
        .find(query)
        .select(projection)
        .sort(sort)
        .skip(skip)
        .limit(l)
        .lean(),
      projectModells.countDocuments(query),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / l));

    return res.status(200).json({
      message: "Projects fetched successfully",
      data: items,
      pagination: {
        page: p,
        limit: l,
        totalDocs: total,
        totalPages,
        hasPrevPage: p > 1,
        hasNextPage: p < totalPages,
      },
      query: {
        search: search || null,
        status: status || null,
        sort,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateProjectStatus = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, remarks } = req.body;
    const project = await projectModells.findById(projectId);
    if (!project) {
      return res.status(404).json({
        message: "Project Not Found",
      });
    }
    project.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
    });
    await project.save();
    res.status(200).json({
      message: "Project Status Updated Successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

//Get Project by ID
const getProjectById = async function (req, res) {
  try {
    const id = req.params._id;
    const project = await projectModells.findById(id);

    if (!project) {
      return res.status(404).json({ msg: "Project not found!" });
    }

    res.status(200).json({ msg: "Project found!", data: project });
  } catch (error) {
    res
      .status(500)
      .json({ msg: "Error fetching project", error: error.message });
  }
};

const getProjectbyPId = async (req, res) => {
  try {
    const { p_id } = req.query;
    if (!p_id) {
      return res.status(404).json({
        message: "P_id not found",
      });
    }
    let query = {};
    if (p_id) {
      query.p_id = p_id;
    }

    const project = await projectModells.find(query);
    res.status(200).json({
      message: "Project Data fetched successfully",
      data: project,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getProjectDropwdown = async (req, res) => {
  try {
    const projects = await projectModells.find(
      {},
      { p_id: 1, name: 1, code: 1, p_group: 1, customer: 1 }
    );
    res.status(200).json({
      message: "Projects fetched successfully",
      data: projects,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getProjectNameSearch = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 7 } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 7, 1);

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const q = search.trim();
    const regex = q
      ? new RegExp(escapeRegex(q).replace(/\s+/g, ".*"), "i")
      : null;

    const filter = q
      ? {
        $or: [{ name: { $regex: regex } }, { code: { $regex: regex } }],
      }
      : {};

    const projection = { _id: 1, name: 1, code: 1, site_address: 1 };
    const sort = { code: 1 };
    const skip = (pageNum - 1) * pageSize;

    const [items, total] = await Promise.all([
      projectModells
        .find(filter, projection)
        .sort(sort)
        .skip(skip)
        .limit(pageSize),
      projectModells.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;
    const hasMore = pageNum < totalPages;

    res.status(200).json({
      message: "Project retrieved Successfully",
      data: items,
      pagination: {
        search,
        page: pageNum,
        pageSize,
        total,
        totalPages,
        hasMore,
        nextPage: hasMore ? pageNum + 1 : null,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Error searching Project",
      error: error.message,
    });
  }
};

const getProjectStatusFilter = async (req, res) => {
  try {
    const match = {};

    const rows = await projectModells.aggregate([
      { $match: match },
      { $group: { _id: "$current_status.status", count: { $sum: 1 } } },
    ]);

    const data = {
      "to be started": 0,
      ongoing: 0,
      completed: 0,
      "on hold": 0,
      delayed: 0,
    };

    for (const r of rows) {
      if (r._id && Object.prototype.hasOwnProperty.call(data, r._id)) {
        data[r._id] = r.count;
      }
    }

    return res.status(200).json({ data });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server error",
      error: error.message,
    });
  }
};

const getProjectDetail = async (req, res) => {
  try {
    const { q = "" } = req.query;

    // Escape regex special chars to avoid ReDoS or unintended patterns
    const escapeRegex = (s = "") =>
      s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const hasQuery = typeof q === "string" && q.trim().length > 0;
    const rx = hasQuery ? new RegExp(escapeRegex(q.trim()), "i") : null;

    const pipeline = [
      // --- JOIN project details with robust type casting ---
      {
        $lookup: {
          from: "projectdetails",
          let: { pid: "$project_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    "$_id",
                    {
                      $cond: [
                        { $eq: [{ $type: "$$pid" }, "string"] },
                        { $toObjectId: "$$pid" },
                        "$$pid",
                      ],
                    },
                  ],
                },
              },
            },
            { $project: { code: 1, name: 1, state: 1 } },
          ],
          as: "projectDoc",
        },
      },
      { $unwind: { path: "$projectDoc", preserveNullAndEmptyArrays: true } },

      // --- Keep a copy of ALL activities before filtering ---
      { $addFields: { _allActs: { $ifNull: ["$activities", []] } } },

      // --- Compute project_completed (all activities have both dates) ---
      {
        $addFields: {
          project_completed: {
            $and: [
              { $gt: [{ $size: "$_allActs" }, 0] }, // non-empty
              {
                $allElementsTrue: {
                  $map: {
                    input: "$_allActs",
                    as: "a",
                    in: {
                      $and: [
                        // actual_start present
                        {
                          $and: [
                            {
                              $not: {
                                $in: [
                                  { $type: "$$a.actual_start" },
                                  ["missing", "null"],
                                ],
                              },
                            },
                            { $ne: ["$$a.actual_start", ""] },
                          ],
                        },
                        // actual_finish present
                        {
                          $and: [
                            {
                              $not: {
                                $in: [
                                  { $type: "$$a.actual_finish" },
                                  ["missing", "null"],
                                ],
                              },
                            },
                            { $ne: ["$$a.actual_finish", ""] },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      },

      // --- FILTER activities: started but not finished ---
      {
        $addFields: {
          activities: {
            $filter: {
              input: "$_allActs",
              as: "a",
              cond: {
                $and: [
                  // actual_start present
                  {
                    $and: [
                      {
                        $not: {
                          $in: [
                            { $type: "$$a.actual_start" },
                            ["missing", "null"],
                          ],
                        },
                      },
                      { $ne: ["$$a.actual_start", ""], },
                    ],
                  },
                  // actual_finish not set
                  {
                    $or: [
                      {
                        $in: [
                          { $type: "$$a.actual_finish" },
                          ["missing", "null"],
                        ],
                      },
                      { $eq: ["$$a.actual_finish", ""], },
                    ],
                  },
                ],
              },
            },
          },
        },
      },

      // --- Collect activity_ids from the filtered activities ---
      {
        $addFields: {
          _activityIds: {
            $map: {
              input: { $ifNull: ["$activities", []] },
              as: "a",
              in: "$$a.activity_id",
            },
          },
        },
      },

      // --- JOIN activity names for the filtered IDs ---
      {
        $lookup: {
          from: "activities",
          let: { ids: "$_activityIds" },
          pipeline: [
            {
              $match: { $expr: { $in: ["$_id", { $ifNull: ["$$ids", []] }] } },
            },
            { $project: { name: 1 } },
          ],
          as: "activityDocs",
        },
      },

      // --- Attach activity_name to each filtered activity ---
      {
        $addFields: {
          activities: {
            $map: {
              input: { $ifNull: ["$activities", []] },
              as: "a",
              in: {
                $mergeObjects: [
                  "$$a",
                  {
                    activity_name: {
                      $let: {
                        vars: {
                          m: {
                            $first: {
                              $filter: {
                                input: "$activityDocs",
                                as: "ad",
                                cond: { $eq: ["$$ad._id", "$$a.activity_id"] },
                              },
                            },
                          },
                        },
                        in: { $ifNull: ["$$m.name", null] },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ];

    // --- Apply search on project fields (after $lookup/$unwind) ---
    if (hasQuery) {
      pipeline.push({
        $match: {
          $or: [
            { "projectDoc.code": rx },
            { "projectDoc.name": rx },
            { "projectDoc.state": rx },
          ],
        },
      });
    }

    // --- If searching, also allow matching any activityDocs.name ---
    if (hasQuery) {
      pipeline.push({
        $match: {
          $or: [
            {}, // keep previous matches
            {
              $expr: {
                $anyElementTrue: {
                  $map: {
                    input: { $ifNull: ["$activityDocs", []] },
                    as: "ad",
                    in: { $regexMatch: { input: "$$ad.name", regex: rx } },
                  },
                },
              },
            },
          ],
        },
      });
    }

    // --- Final projection ---
    pipeline.push({
      $project: {
        project_id: 1,
        status: 1,
        project_code: "$projectDoc.code",
        project_name: "$projectDoc.name",
        state: "$projectDoc.state",
        project_completed: 1,
        activities: {
          $map: {
            input: { $ifNull: ["$activities", []] },
            as: "a",
            in: {
              activity_id: "$$a.activity_id",
              activity_name: "$$a.activity_name",
              actual_start_date: "$$a.actual_start",
              dependency: "$$a.dependency",
              successors: "$$a.successors",
              predecessors: "$$a.predecessors",
            },
          },
        },
      },
    });

    const data = await projectactivitiesModel.aggregate(pipeline);
    return res.json({ ok: true, count: data.length, data });
  } catch (err) {
    console.error("getProjectDetail error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Server error", error: String(err) });
  }
};


// controller
const getProjectStates = async (req, res) => {
  try {
    const match = {};

    pipeline = [
      { $group: { _id: "$state", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ];

    const states = await projectModells.aggregate(pipeline);

    let totalCount = 0;
    for (const state of states) {
      totalCount += state.count;
    }

    return res.status(200).json({
      total: totalCount,
      data: states,
      message: "Fetch State Successfully",
    });
  } catch (err) {
    console.error("getProjectStates error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Server error", error: String(err) });
  }
};

const getActivityLineForProject = async (req, res) => {
  try {
    const raw = req.params.projectId || ""; // may be "id" or "id1,id2"
    const ids = raw.includes(",")
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : raw
        ? [raw]
        : [];

    const asMs = (d) => (d ? new Date(d).getTime() : null);

    // Attach project_name to every payload
    const buildResponseForDoc = (doc, activityNameById, fallbackProjectId, projectName) => {
      const now = Date.now();

      if (!doc) {
        return {
          project_id: String(fallbackProjectId ?? ""),
          project_name: projectName || "",
          data: [],
          domain: { min: null, max: null, now },
        };
      }

      const rows = (doc.activities || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((a, idx) => ({
          idx,
          activity_id: a.activity_id,
          activity_name: activityNameById[String(a.activity_id)] || `Activity ${idx + 1}`,
          planned_start_ms: asMs(a.planned_start),
          planned_finish_ms: asMs(a.planned_finish),
          actual_start_ms: asMs(a.actual_start),
          actual_finish_ms: asMs(a.actual_finish),
          ongoing: !!(asMs(a.actual_start) && !asMs(a.actual_finish)),
        }));

      const allDates = rows
        .flatMap((r) => [
          r.planned_start_ms,
          r.planned_finish_ms,
          r.actual_start_ms,
          r.actual_finish_ms,
        ])
        .filter(Boolean);

      const minDate = allDates.length ? Math.min(...allDates) : null;
      const maxDate = allDates.length ? Math.max(...allDates) : null;

      return {
        project_id: String(doc.project_id ?? fallbackProjectId ?? ""),
        project_name: projectName || "",
        data: rows,
        domain: { min: minDate, max: maxDate, now },
      };
    };

    // --- SINGLE ---
    if (ids.length <= 1) {
      const projectId = ids[0] ?? "";

      // fetch activity doc + project name in parallel
      const [doc, projDoc] = await Promise.all([
        projectactivitiesModel.findOne({ project_id: projectId }).lean().exec(),
        projectModells.findById(projectId, { name: 1 }).lean().exec(), // <— name only
      ]);

      if (!doc) {
        return res.json({
          rows: [
            {
              project_id: projectId,
              project_name: projDoc?.name || "",
              data: [],
              domain: { min: null, max: null, now: Date.now() },
            },
          ],
          domain: { min: null, max: null, now: Date.now() },
        });
      }

      const activityIds = (doc.activities || [])
        .map((a) => a.activity_id)
        .filter(Boolean)
        .map(String);

      const actDocs = activityIds.length
        ? await activitiesModel.find({ _id: { $in: activityIds } }, { name: 1 }).lean()
        : [];

      const activityNameById = Object.fromEntries(
        actDocs.map((a) => [String(a._id), a.name])
      );

      const payload = buildResponseForDoc(
        doc,
        activityNameById,
        projectId,
        projDoc?.name || ""
      );

      return res.json({
        rows: [payload],
        domain: payload.domain, // or compute a global domain if you prefer
      });
    }

    // --- MULTI ---
    const [docs, projDocs] = await Promise.all([
      projectactivitiesModel.find({ project_id: { $in: ids } }).lean().exec(),
      projectModells.find({ _id: { $in: ids } }, { name: 1 }).lean().exec(), // <— names for all ids
    ]);

    const projectNameById = Object.fromEntries(
      (projDocs || []).map((p) => [String(p._id), p?.name || ""])
    );

    const uniqueActivityIds = Array.from(
      new Set(
        docs.flatMap((d) =>
          (d.activities || [])
            .map((a) => String(a.activity_id))
            .filter(Boolean)
        )
      )
    );

    const actDocs = uniqueActivityIds.length
      ? await activitiesModel.find({ _id: { $in: uniqueActivityIds } }, { name: 1 }).lean()
      : [];

    const activityNameById = Object.fromEntries(
      actDocs.map((a) => [String(a._id), a.name])
    );

    const docByProjectId = new Map(docs.map((d) => [String(d.project_id), d]));

    const rows = ids.map((id) =>
      buildResponseForDoc(
        docByProjectId.get(String(id)) || null,
        activityNameById,
        id,
        projectNameById[String(id)] || ""
      )
    );

    const mins = rows.map((r) => r.domain.min).filter((v) => v != null);
    const maxs = rows.map((r) => r.domain.max).filter((v) => v != null);

    return res.json({
      rows,
      domain: {
        min: mins.length ? Math.min(...mins) : null,
        max: maxs.length ? Math.max(...maxs) : null,
        now: Date.now(),
      },
    });
  } catch (err) {
    console.error("getActivityLineForProject error:", err);
    res.status(500).json({ message: "Server error", error: err?.message });
  }
};



const getProjectsDropdown = async (req, res) => {
  try {
  
    const data = await projectModells.find().lean();

    return res.status(200).json({
      message: "Fetch Successfully",
      data,
    })
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error", err: error });
  }
};

const getAllPosts = async (req, res) => {
  try {
    const LIMIT = 200;

    const pipeline = [
      {
        $match: {
          $or: [
            { comments: { $exists: true, $ne: [] } },
            { attachment: { $exists: true, $ne: [] } },
          ],
        },
      },
      {
        $lookup: {
          from: "projectdetails",
          localField: "project_id",
          foreignField: "_id",
          as: "project",
          pipeline: [{ $project: { _id: 1, code: 1, name: 1 } }],
        },
      },
      { $set: { project: { $first: "$project" } } },

      {
        $facet: {
          comments: [
            { $unwind: "$comments" },
            {
              $lookup: {
                from: "users",
                localField: "comments.user_id",
                foreignField: "_id",
                as: "commentUser",
                pipeline: [
                  {
                    $project: { _id: 1, name: 1, emp_id: 1, attachment_url: 1 },
                  },
                ],
              },
            },
            { $set: { commentUser: { $first: "$commentUser" } } },
            {
              $project: {
                _id: 0,
                type_order: { $literal: 0 },
                createdAt: "$comments.updatedAt",
                project_id: "$project_id",
                project_code: "$project.code",
                project_name: "$project.name",
                comment: "$comments.comment",
                user_id: "$comments.user_id",
                updatedAt: "$comments.updatedAt",
                name: "$commentUser.name",
                emp_id: "$commentUser.emp_id",
                attachment_url: "$commentUser.attachment_url",
              },
            },
            { $sort: { createdAt: -1 } },
          ],
          attachments: [
            { $unwind: "$attachment" },
            {
              $project: {
                _id: 0,
                type_order: { $literal: 1 },
                createdAt: "$attachment.updatedAt",
                project_id: "$project_id",
                project_code: "$project.code",
                project_name: "$project.name",
                comment: { $literal: "" },
                user_id: { $literal: "" },
                updatedAt: "$attachment.updatedAt",
                name: { $literal: "" },
                emp_id: { $literal: "" },
                attachment_url: "$attachment.url",
              },
            },
            { $sort: { createdAt: -1 } },
          ],
        },
      },

      { $project: { all: { $concatArrays: ["$comments", "$attachments"] } } },
      { $unwind: "$all" },
      { $replaceRoot: { newRoot: "$all" } },
      { $sort: { type_order: 1, createdAt: -1 } },
      { $limit: LIMIT },

      // Add ago string + action
      {
        $set: {
          updatedAtIso: "$updatedAt",
          ago: {
            $let: {
              vars: {
                yrs: {
                  $dateDiff: {
                    startDate: "$updatedAt",
                    endDate: "$$NOW",
                    unit: "year",
                  },
                },
                mos: {
                  $dateDiff: {
                    startDate: "$updatedAt",
                    endDate: "$$NOW",
                    unit: "month",
                  },
                },
                wks: {
                  $dateDiff: {
                    startDate: "$updatedAt",
                    endDate: "$$NOW",
                    unit: "week",
                  },
                },
                dys: {
                  $dateDiff: {
                    startDate: "$updatedAt",
                    endDate: "$$NOW",
                    unit: "day",
                  },
                },
                hrs: {
                  $dateDiff: {
                    startDate: "$updatedAt",
                    endDate: "$$NOW",
                    unit: "hour",
                  },
                },
                mins: {
                  $dateDiff: {
                    startDate: "$updatedAt",
                    endDate: "$$NOW",
                    unit: "minute",
                  },
                },
              },
              in: {
                $switch: {
                  branches: [
                    {
                      case: { $gt: ["$$yrs", 0] },
                      then: { $concat: [{ $toString: "$$yrs" }, " y ago"] },
                    },
                    {
                      case: { $gt: ["$$mos", 0] },
                      then: { $concat: [{ $toString: "$$mos" }, " mo ago"] },
                    },
                    {
                      case: { $gt: ["$$wks", 0] },
                      then: { $concat: [{ $toString: "$$wks" }, " w ago"] },
                    },
                    {
                      case: { $gt: ["$$dys", 0] },
                      then: { $concat: [{ $toString: "$$dys" }, " d ago"] },
                    },
                    {
                      case: { $gt: ["$$hrs", 0] },
                      then: { $concat: [{ $toString: "$$hrs" }, " h ago"] },
                    },
                    {
                      case: { $gt: ["$$mins", 1] },
                      then: { $concat: [{ $toString: "$$mins" }, " m ago"] },
                    },
                  ],
                  default: "just now",
                },
              },
            },
          },
          action: {
            $cond: [{ $ne: ["$comment", ""] }, "commented on", "attached"],
          },
        },
      },

      {
        $project: {
          _id: 0,
          project_id: 1,
          project_code: 1,
          project_name: 1,
          comment: 1,
          user_id: 1,
          updatedAtIso: 1,
          ago: 1,
          action: 1,
          name: 1,
          emp_id: 1,
          attachment_url: 1,
        },
      },
    ];

    const rows = await postsModel.aggregate(pipeline);

    return res.status(200).json({
      message: "Activity feed (flat) fetched successfully",
      data: rows,
    });
  } catch (error) {
    console.error("getAllPosts error:", error);
    res.status(500).json({
      message: "Internal Server Error",
      error: error?.message || String(error),
    });
  }
};

// Node/Mongoose
const updateProjectStatusForPreviousProjects = async (req, res) => {
  try {
    const result = await projectModells.updateMany(
      {}, // all projects
      [
        {
          $set: {
            status_history: {
              $cond: [
                { $or: [{ $eq: ["$status_history", null] }, { $not: ["$status_history"] }] },
                [],
                "$status_history",
              ],
            },
            current_status: {
              $cond: [
                { $or: [{ $eq: ["$current_status", null] }, { $not: ["$current_status"] }] },
                { status: "to be started", updated_at: "$$NOW", user_id: null },
                "$current_status",
              ],
            },
          },
        },
      ]
    );

    console.log("Matched:", result.matchedCount, "Modified:", result.modifiedCount);
    return res.status(200).json({
      ok: true,
      msg: "Project status history updated successfully",
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, msg: "Error updating project status history", error: error.message });
  }
};

const toObjectIdOrNull = (v) => {
  if (!v) return null;
  if (mongoose.isValidObjectId(v)) return new mongoose.Types.ObjectId(v);
  if (v?._id && mongoose.isValidObjectId(v._id)) return new mongoose.Types.ObjectId(v._id);
  return null;
};

const updateSubmittedByOfProject = async (req, res) => {
  try {
    // 1) Get projects where submitted_by is missing, null, or (bad) string
    const projects = await projectModells.find(
      {
        $or: [
          { submitted_by: { $exists: false } },
          { submitted_by: null },
          { submitted_by: { $type: "string" } }, // covers "" and any stray strings
        ],
      },
      { _id: 1, p_id: 1, submitted_by: 1 }
    ).lean();

    if (!projects.length) {
      return res.status(200).json({
        ok: true,
        message: "No projects need submitted_by backfill.",
        meta: { totalProjectsChecked: 0, updated: 0, skipped: 0 },
      });
    }

    // 2) Fetch handovers by p_id
    const pids = projects.map((p) => p.p_id).filter(Boolean);
    const handovers = await handoversheetModells.find(
      { p_id: { $in: pids } },
      { p_id: 1, submitted_by: 1 }
    ).lean();
    const handoverByPid = new Map(handovers.map((h) => [String(h.p_id), h]));

    // 3) Build updates
    const ops = [];
    let updated = 0;
    let skipped = 0;

    // Define a default ObjectId to be used when `submitted_by` is missing
    const defaultSubmittedById = new mongoose.Types.ObjectId("6839a4086356310d4e15f6fd");

    for (const proj of projects) {
      // If the `submitted_by` field is missing or empty string, handle it
      if (proj.submitted_by !== "" && proj.submitted_by != null) { 
        skipped++;
        continue;
      }

      const h = handoverByPid.get(String(proj.p_id));

      // If there's no handover, set the submitted_by to default
      if (!h) {
        ops.push({
          updateOne: {
            filter: { _id: proj._id }, // Update project with default submitted_by
            update: { $set: { submitted_by: defaultSubmittedById } },
          },
        });
        updated++;
        continue; // Skip further checks for this project as it was handled
      }

      // If handover exists, get submitted_by from it or set to default
      const sbId = h.submitted_by ? toObjectIdOrNull(h.submitted_by) : defaultSubmittedById;

      // If there's no valid submitted_by from handover or a default ID, skip this project
      if (!sbId) { skipped++; continue; }

      // If the project already has submitted_by (but wrong value), update it
      ops.push({
        updateOne: {
          filter: { _id: proj._id, submitted_by: { $ne: sbId } }, // Only update if different
          update: { $set: { submitted_by: sbId } },
        },
      });
      updated++;
    }

    if (ops.length) {
      await projectModells.bulkWrite(ops, { ordered: false });
    }

    return res.status(200).json({
      ok: true,
      message: "submitted_by synced from handover to project (ObjectId) or set to default.",
      meta: { totalProjectsChecked: projects.length, updated, skipped },
    });
  } catch (error) {
    console.error("updateSubmittedByOfProject error:", error);
    return res.status(500).json({
      ok: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateSkippedProject = async (req, res) => {
  try {
    // Step 1: Find the ObjectId for "Guddu Rani Dubey"
    const user = await userModells.findOne({ name: "Guddu Rani Dubey" });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const newSubmittedById = user._id; // Get the ObjectId for the user

    // Step 2: Find the projects where `submitted_by` is the string "Guddu Rani Dubey"
    const projects = await projectModells.find({ submitted_by: "Guddu Rani Dubey" });
    console.log(projects);
    if (projects.length > 0) {
      // Step 3: Loop through all projects and update the `submitted_by` field with ObjectId
      for (let project of projects) {
        project.submitted_by = new mongoose.Types.ObjectId(newSubmittedById);  // Set the new ObjectId

        // Save the updated project
        await project.save();
      }

      return res.status(200).json({ message: "Projects updated successfully" });
    } else {
      return res.status(404).json({ message: "No projects found with the specified submitted_by name" });
    }
  } catch (error) {
    console.error("Error updating projects:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


module.exports = {
  createProject,
  updateProject,
  getallproject,
  getAllProjects,
  updateProjectStatus,
  deleteProjectById,
  getProjectById,
  getProjectbyPId,
  getProjectDropwdown,
  getProjectNameSearch,
  getProjectStatusFilter,
  getProjectDetail,
  getProjectStates,
  getActivityLineForProject,
  getProjectsDropdown,
  getAllPosts,
  updateProjectStatusForPreviousProjects,
  updateSubmittedByOfProject,
  updateSkippedProject
};
