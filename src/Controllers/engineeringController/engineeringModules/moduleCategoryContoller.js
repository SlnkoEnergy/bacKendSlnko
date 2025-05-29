const moduleProject = require("../../../Modells/EngineeringModells/engineeringModules/moduleCategory");

const createModuleProject = async (req, res) => {
  try {
    const data = req.body;
    const moduleData = new moduleProject(data);

    await moduleData.save();
    res.status(201).json({
      message: "Module Project Created Successfully",
      data: moduleData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getModuleProject = async (req, res) => {
  try {
    const data = await moduleProject
      .find()
      .populate("items.category_id")
      .populate("project_id");

    res.status(200).json({
      message: "Module Projects fetched successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getModuleProjectById = async (req, res) => {
  try {
    const data = await moduleProject
      .findById(req.params._id)
      .populate("items.category_id")
      .populate("project_id");

    res.status(200).json({
      message: "Module Project fetched Successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


module.exports = {
  createModuleProject,
  getModuleProject,
  getModuleProjectById
};
