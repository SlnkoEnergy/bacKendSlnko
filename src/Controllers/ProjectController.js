const { request } = require("express");
const projectModells = require("../Modells/projectModells");
const handoversheetModells = require("../Modells/handoversheetModells");

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
      { p_id: 1, name: 1, code: 1 , p_group: 1}
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

module.exports = {
  createProject,
  updateProject,
  getallproject,
  deleteProjectById,
  getProjectById,
  getProjectbyPId,
  getProjectDropwdown,
};
