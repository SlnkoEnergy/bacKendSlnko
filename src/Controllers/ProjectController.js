const projectModells = require("../Modells/projectModells");

const createProject = async function (req, res) {
  try {
    // Extract project data from the request body
    let {
      p_id,
      customer,
      name,
      p_group,
      email,
      number,
      alternateMobilenumber,
      billingAddress,
      siteAddress,
      state,
      plantCapacity,
      subStationDistance,
      tarrif,
      landAvailable,
      SLnkoServiceCharges,
      project_status,
      projectSubmmitedBy,
    } = req.body;

    // Log the incoming request body to check the data
    //console.log("Received Project Data: ", req.body);

    // Create a new project instance with the received data
    const newProject = new projectModells({
      p_id,
      customer,
      name,
      p_group,
      email,
      number,
      alternateMobilenumber,
      billingAddress,
      siteAddress,
      state,
      plantCapacity,
      subStationDistance,
      tarrif,
      landAvailable,
      SLnkoServiceCharges,
      project_status,
      projectSubmmitedBy,
    });

    // Save the new project to the database
    let savedProject = await newProject.save();
    //console.log("Saved Project: ", savedProject);


    res.status(201).json({
      msg: "Project created successfully",
      data: savedProject, 
    });

  } catch (error) {
    // If there's an error, send a response with status 400 (Bad Request)
    console.error("Error saving project: ", error);
    res.status(400).json({
      msg: "Error saving project",
      error: error.message,
      validationErrors: error.errors,  // Show validation errors if any
    });
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



//view all project

const getallproject = async function (req,res)  {
  let data = await projectModells.find();
  res.status(200).json({msg: "All Project", data})
  
}



module.exports = {
  createProject,
  updateProject,
  getallproject,
};
