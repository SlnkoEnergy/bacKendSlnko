const { request } = require("express");
const projectModells = require("../Modells/projectModells");





const createProject = async function (req, res) { 

  try{
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
} = req.body;

const lastProject = await projectModells.findOne().sort({ p_id: -1 }).exec();
const newPId = lastProject ? parseInt(lastProject.p_id, 10) + 1 : 1;

const checkProject = await projectModells.findOne({code: code});{
  if (checkProject) {
    return res.status(400).json({ msg: "Project code already exists!" });
  }
}
// Create a new project instance
const newProject = new projectModells({
  p_id:newPId.toString().padStart(6, '0'),
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
});

// Save the project to the database
await newProject.save();

// Respond with success message and the saved data
return res.status(201).json({ msg: 'Project details saved successfully!', data: newProject });
} catch (error) {
console.error('Error saving project details:', error);
return res.status(500).json({ msg: 'Failed to save project details.', error: error.message });
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
    const updatedProject = await projectModells.findByIdAndUpdate(_id, updateData, {
      new: true, // Return the updated document
      runValidators: true, // Ensure validation rules are applied
    });

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
    res.status(500).json({ msg: "Error deleting project", error: error.message });
  }
};



//view all project
 const getallproject = async function (req,res)  {
let data = await projectModells.find();
res.status(200).json({msg: "All Project", data:data})
      
}

 



module.exports = {
  createProject,
  updateProject,
  getallproject,
  deleteProjectById,
};
