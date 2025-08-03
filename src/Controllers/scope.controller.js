const scopeModel = require("../Modells/scope.model");
const MaterialCategory = require("../Modells/EngineeringModells/materials/materialCategoryModells");

const createScope = async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ message: "Data is required" });
    }
    const scope = new scopeModel({
      ...data,
      createdBy: req.user.userId,
    });
    await scope.save();
    return res
      .status(201)
      .json({ message: "Scope created successfully", data: scope });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const getScopeById = async (req, res) => {
  try {
    const { project_id } = req.query;

    const scope = await scopeModel.findOne({project_id})
      .populate("current_status.user_id", "name")
      .populate("status_history.user_id", "name")
      .populate("createdBy", "name");

    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }

    return res.status(200).json({
      message: "Scope and material details retrieved successfully",
      data: scope
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getAllScopes = async (req, res) => {
  try {
    const scopes = await scopeModel.find()
      .populate("current_status.user_id", "name")
      .populate("status_history.user_id", "name");

    return res.status(200).json({
      message: "Materials with scope info retrieved successfully",
      data: scopes
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};


const updateScope = async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    const scope = await scopeModel.findOneAndUpdate({ project_id }, req.body, {
      new: true,
    });
    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }
    return res
      .status(200)
      .json({ message: "Scope updated successfully", data: scope });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const deleteScope = async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    const scope = await scopeModel.findOneAndDelete({ project_id });
    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }
    return res.status(200).json({ message: "Scope deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const updateScopeStatus = async (req, res) => {
  try {
    const { project_id } = req.params;
    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    const scope = await scopeModel.findOne({ project_id });
    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }
    const { status, remarks } = req.body;
    if (!status || !remarks) {
      return res
        .status(400)
        .json({ message: "Status and remarks are required" });
    }
    await scope.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
    });
    await scope.save();
    return res
      .status(200)
      .json({ message: "Scope status updated successfully", data: scope });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
module.exports = {
  createScope,
  getScopeById,
  getAllScopes,
  updateScope,
  deleteScope,
  updateScopeStatus,
};
