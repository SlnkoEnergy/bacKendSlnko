const moduleTemplate = require("../../../Modells/EngineeringModells/engineeringModules/moduleTemplate");

const createModule = async (req, res) => {
  try {
    const data = req.body;
    const moduleData = new moduleTemplate(data);

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
    const moduleData = await moduleTemplate.findById(req.params._id);
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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const moduleData = await moduleTemplate
      .find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
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
    const moduleData = await moduleTemplate.findByIdAndUpdate(
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
    const deleteModule = await moduleTemplate.findByIdAndDelete(req.params._id);
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
  deleteModule,
};
