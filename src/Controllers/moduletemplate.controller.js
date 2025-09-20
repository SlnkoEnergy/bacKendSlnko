const moduleTemplate = require("../models/moduletemplate.model");
const { isAllowedDependency } = require("../utils/isalloweddependency.utils");

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
    const moduleData = await moduleTemplate
      .findById(req.params._id)
      .populate('boq.template_category', 'name description');

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
    const moduleData = await moduleTemplate
      .find()
      .populate('boq.template_category', 'name description');

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

const getAllowedModule = async (req, res) => {
  try {
    const {projectId} = req.params;
    if (!projectId) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    const moduleIds = await isAllowedDependency(projectId, "moduleTemplates");
    const modules = await moduleTemplate.find({ _id: { $in: moduleIds } });
    res.status(200).json({
      message: "Allowed Modules Retrieved Successfully",
      data: modules,
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

const updateModuleTemplateCategoryId = async (req, res) => {
  try {
    const id = req.params._id;
    const { template_category } = req.body;

    const updatedModule = await moduleTemplate.findByIdAndUpdate(
      id,
      { $push: { 'boq.template_category': template_category } },
      { new: true }
    );

    res.status(200).json({
      message: "Module Template Category ID Updated Successfully",
      data: updatedModule,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
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
  updateModuleTemplateCategoryId,
  getAllowedModule
};
