const moduleCategory = require("../../../Modells/EngineeringModells/engineeringModules/moduleCategory");

const createModule = async (req, res) => {
  try {
    const data = req.body;
    const moduleData = new moduleCategory(data);

    await moduleData.save();
    res.status(201).json({
      message: "Module Category created successfully",
      moduleData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getModuleById = async (req, res) => {
  try {
    const moduleData = await moduleCategory.findById(req.params._id);
    res.status(200).json({
      message: "Module Category Retrieved Successfully",
      data: moduleData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getAllModule = async (req, res) => {
  try {
    const moduleData = await moduleCategory.find();
    res.status(200).json({
      message: "Module Category Retrieved Successfully",
      data: moduleData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateModule = async (req, res) => {
  try {
    const moduleData = await moduleCategory.findByIdAndUpdate(
      req.params._id,
      req.body,
      { new: true }
    );
    res.status(201).json({
      message: "Module Category Updated Successfully",
      data: moduleData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const deleteModule = async (req, res) => {
  try {
    const deleteModule = await moduleCategory.findByIdAndDelete(req.params._id);
    res.status(200).json({
      message: "Module Category Deleted Successfully",
      data: deleteModule,
    });
  } catch (error) {
    res.status(500).json({
      message: "Module Category Deleted Successfully",
      error: error.message,
    });
  }
};

module.exports = {
  createModule,
  getModuleById,
  getAllModule,
  updateModule,
  deleteModule
};
