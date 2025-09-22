const projectModells = require("../models/project.model");
const handoversheetModells = require("../models/handoversheet.model");

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
  const { _id } = req.params; // Extracting Project ID from the request params
  const updateData = req.body; // Extracting data to update from the request body

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
    const id = req.params._id; // Project ID from the request params
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

    // escape user text for safe regex
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const q = search.trim();
    const regex =
      q ? new RegExp(escapeRegex(q).replace(/\s+/g, ".*"), "i") : null;

    // 🔁 search by name OR code (project id)
    const filter = q
      ? {
        $or: [
          { name: { $regex: regex } },
          { code: { $regex: regex } }, // <- project id field
          // If your collection uses other fields for the id, add them too:
          // { project_id: { $regex: regex } },
          // { p_id: { $regex: regex } },
        ],
      }
      : {};

    const projection = { _id: 1, name: 1, code: 1, site_address: 1 };
    const sort = { code: 1 };
    const skip = (pageNum - 1) * pageSize;

    const [items, total] = await Promise.all([
      projectModells.find(filter, projection).sort(sort).skip(skip).limit(pageSize),
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
    ])

    console.log(rows);
    const data = {
      "to be started": 0,
      "ongoing": 0,
      "completed": 0,
      "on hold": 0,
      "delayed": 0,
    }

    for (const r of rows) {
      if (r._id && Object.prototype.hasOwnProperty.call(data, r._id)) {
        data[r._id] = r.count;
      }
    }

    return res.status(200).json({ data })
  } catch (error) {

    return res.status(500).json({
      message: "Internal Server error",
      error: error.message,
    })
  }
}

const getProjectDetail = async (req, res) => {

  // const match  = {};

  // const pipeline = [

  //   {$match : match},

  //   {
  //     $project: {
  //       code : 1,
  //       name: 1, 
  //       state: 1, 
  //       current_status: 1, 
  //       status_history: 1, 
  //       updatedAt: 1, 
  //     }
  //   },

  //   {
  //     $lookup :{
  //       from: "projectDetail",
  //       let: {pid: "$_id"},
  //       pipeline: [
  //         { $match : {$expr : { $eq: ["$project_id", "$$pid"]}, status: "project"}},
  //         { $unwind: { path: "$activities", preserveNullAndEmptyArrays: true}},

  //         {
  //           $lookup: {
  //             from: "activities",
  //             let: {actId : "$activities.activity_id"},

  //             pipeline: [
  //               { $match: {$expr: {$eq: ["$_id", "$$actId"]}}},
  //               { $project : { _id: 1, name: 1, description: 1, dependency: 1 }},

  //             ], 
  //             as: "act"
  //           },
  //         },
  //         {$unwind: {path: "$act", preserveNullAndEmptyArrays: true}},

  //       ]

  //     }
  //   }
  // ]

  try {
    const pipeline = [
      { $match: matchStage },

      // bring minimal project fields (code, name, state)
      {
        $lookup: {
          from: "projectdetails",
          localField: "project_id",
          foreignField: "_id",
          as: "project",
          pipeline: [
            {
              $project: {
                _id: 1,
                code: 1,
                name: 1,
                state: 1,
              },
            },
          ],
        },
      },
      { $unwind: "$project" },

      // explode activities to evaluate each activity separately
      { $unwind: { path: "$activities", preserveNullAndEmptyArrays: true } },

      // join activity master for name/description
      {
        $lookup: {
          from: "activities",
          let: { actId: "$activities.activity_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$actId"] } } },
            { $project: { _id: 1, name: 1, description: 1 } },
          ],
          as: "act",
        },
      },
      { $unwind: { path: "$act", preserveNullAndEmptyArrays: true } },

      // compute helpers & a normalized activity object
      {
        $addFields: {
          _now: "$$NOW",
          _isInProgress: {
            $eq: ["$activities.current_status.status", "in progress"],
          },
          _isNotStarted: {
            $eq: ["$activities.current_status.status", "not started"],
          },
          _finish_time: {
            $ifNull: ["$activities.actual_finish", "$activities.planned_finish"],
          },
          _planned_start: "$activities.planned_start",
          _planned_finish: "$activities.planned_finish",
          _activity_obj: {
            _id: "$activities.activity_id",
            name: "$act.name",
            description: "$act.description",
            planned_start: "$activities.planned_start",
            planned_finish: "$activities.planned_finish",
            actual_start: "$activities.actual_start",
            actual_finish: "$activities.actual_finish",
            duration: "$activities.duration",
            percent_complete: "$activities.percent_complete",
            status: "$activities.current_status.status",
            status_updated_at: "$activities.current_status.updated_at",
          },
        },
      },

      // sort by planned_start ASC so grouped arrays maintain chronological order
      { $sort: { "_planned_start": 1 } },

      // group back per project and build candidate lists
      {
        $group: {
          _id: "$project_id",
          project: { $first: "$project" },

          // activities "in progress" (ordered by planned_start due to $sort)
          inProgressArr: {
            $push: {
              $cond: [
                "$_isInProgress",
                {
                  activity: "$_activity_obj",
                  finish_time: "$_finish_time",
                },
                null,
              ],
            },
          },

          // upcoming = not started and starts in future (>= now)
          upcomingArr: {
            $push: {
              $cond: [
                {
                  $and: [
                    "$_isNotStarted",
                    { $gte: ["$_planned_start", "$_now"] },
                  ],
                },
                {
                  activity: "$_activity_obj",
                },
                null,
              ],
            },
          },

          // not-started in the past (candidate for "current" if none in progress)
          notStartedPastArr: {
            $push: {
              $cond: [
                {
                  $and: [
                    "$_isNotStarted",
                    { $lt: ["$_planned_start", "$_now"] },
                  ],
                },
                {
                  activity: "$_activity_obj",
                  finish_time: "$_finish_time",
                },
                null,
              ],
            },
          },
        },
      },

      // remove nulls from arrays and pick first elements
      {
        $project: {
          project: 1,

          // clean arrays
          inProgressArr: {
            $filter: {
              input: "$inProgressArr",
              as: "it",
              cond: { $ne: ["$$it", null] },
            },
          },
          upcomingArr: {
            $filter: {
              input: "$upcomingArr",
              as: "it",
              cond: { $ne: ["$$it", null] },
            },
          },
          notStartedPastArr: {
            $filter: {
              input: "$notStartedPastArr",
              as: "it",
              cond: { $ne: ["$$it", null] },
            },
          },
        },
      },

      // choose current & upcoming based on priority rules
      {
        $addFields: {
          current_choice: {
            $cond: [
              { $gt: [{ $size: "$inProgressArr" }, 0] },
              { $first: "$inProgressArr" },
              {
                $cond: [
                  { $gt: [{ $size: "$notStartedPastArr" }, 0] },
                  { $first: "$notStartedPastArr" },
                  null,
                ],
              },
            ],
          },
          upcoming_choice: {
            $cond: [
              { $gt: [{ $size: "$upcomingArr" }, 0] },
              { $first: "$upcomingArr" },
              null,
            ],
          },
        },
      },

      // flatten the final shape
      {
        $project: {
          _id: 0,
          project_id: "$project._id",
          code: "$project.code",
          name: "$project.name",
          state: "$project.state",

          current_activity: "$current_choice.activity",
          current_activity_finish_time: "$current_choice.finish_time",

          upcoming_activity: "$upcoming_choice.activity",
        },
      },

      // Optional project-level state filter
      ...(state && String(state).trim()
        ? [{ $match: { state: String(state).trim() } }]
        : []),

      // sort/paginate
      { $sort: { code: 1 } },
      { $skip: skip },
      { $limit: pageSize },
    ];

    const [rows, total] = await Promise.all([
      ProjectActivity.aggregate(pipeline).allowDiskUse(true),
      // For total, repeat the initial match and optional state filter on PA joined with projectdetails.
      // Cheaper approximation: count distinct project_ids with status 'project'
      ProjectActivity.countDocuments(matchStage),
    ]);

    return res.status(200).json({
      message: "Projects activity summary fetched",
      page: pageNum,
      limit: pageSize,
      total,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    return res.status(500).json({message: "internal server error", error: error.message})
  }
}


module.exports = {
  createProject,
  updateProject,
  getallproject,
  deleteProjectById,
  getProjectById,
  getProjectbyPId,
  getProjectDropwdown,
  getProjectNameSearch,
  getProjectStatusFilter,
  getProjectDetail
};
