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
  try{

    const match = {};

    const pipeline = [

      {$match: match},

      {
        $lookup: {
          form : "projectactivities",
          localfield: _id,
          foreginfield : project_id,
          as: "project_activity"
        }
        
      }
    ]
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
