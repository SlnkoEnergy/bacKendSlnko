const projectModells = require("../Modells/projectModells");

const createProject = async function (req, res) { 

  try{
  const {
  p_id,
  customer,
  name,
  p_group,
  email,
  number,

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

// Validation: Ensure required fields are present
// if (!p_id || !customer || !name) {
//   return res.status(400).json({ msg: 'p_id, customer, and name are required fields!' });
// }

// Create a new project instance
const newProject = new projectModells({
  p_id,
  customer,
  name,
  p_group,
  email,
  number,

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
  let id = req.params._id; // Project ID from the request params
  let updateData = req.body; // Data to update from the request body

  try {
    let update = await projectModells.findByIdAndUpdate(id, updateData, {
      new: true,
    });
    res.status(200).json({
      msg: "Project updated successfully",
      data: update, // Send back the updated project data
    });
  } catch (error) {
    res.status(400).json({ msg: "Server error", error: error.message });
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
  res.status(200).json({msg: "All Project", data})
  
}



module.exports = {
  createProject,
  updateProject,
  getallproject,
  deleteProjectById,
};
