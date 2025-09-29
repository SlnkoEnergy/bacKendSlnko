const projectModells = require("../models/project.model");
const handoversheetModells = require("../models/handoversheet.model");
const projectactivitiesModel = require("../models/projectactivities.model");
const { default: mongoose } = require("mongoose");
const postsModel = require("../models/posts.model");

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
    const data = await projectactivitiesModel.aggregate([
      // --- JOIN project details with robust type casting ---
      {
        $lookup: {
          from: "projectdetails", // ensure exact collection name
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
              { $gt: [{ $size: "$_allActs" }, 0] }, // avoid vacuous "all true" on empty array
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
                  // actual_start is present (not missing/null/empty)
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
                  // actual_finish is NOT set (missing/null/empty)
                  {
                    $or: [
                      {
                        $in: [
                          { $type: "$$a.actual_finish" },
                          ["missing", "null"],
                        ],
                      },
                      { $eq: ["$$a.actual_finish", ""] },
                    ],
                  },
                ],
              },
            },
          },
        },
      },

      // --- Collect activity_ids from the (filtered) activities ---
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

      // --- Final projection ---
      // --- Final projection ---
      {
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
      },
    ]);

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
  getAllPosts,
};
