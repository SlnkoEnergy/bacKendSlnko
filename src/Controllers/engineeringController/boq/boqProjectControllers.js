const boqProject = require("../../../Modells/EngineeringModells/boq/boqProject");

const createBoqProject = async (req, res) => {
  try {
    const response = await boqProject.create(req.body);
    res.status(201).json({
      message: "Boq Project created successfully",
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getAllBoqProject = async (req, res) => {
  try {
    const response = await boqProject
      .find()
      .populate("project_id")
      .populate("items.boq_template_id")
      .populate("items.module_template_id");
    res.status(200).json({
      message: "Boq Projects fetched successfully",
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getBoqProjectById = async (req, res) => {
  try {
    const response = await boqProject
      .findById(req.params._id)
      .populate("project_id")
      .populate("items.boq_template_id")
      .populate("items.module_template_id");
    res.status(200).json({
      message: "Boq Project fetched successfully",
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateBoqProject = async (req, res) => {
  try {
    const { boqId, itemId } = req.params;
    const response = await boqProject
      .findOneAndUpdate(
        { _id: boqId, "items._id": itemId },
        { $set: { "items.$": req.body } },
        { new: true }
      )
      .populate("project_id")
      .populate("items.boq_template_id")
      .populate("items.module_template_id");
    
    if (!response) {
      return res.status(404).json({
        message: "Boq Project or Item not found",
      });
    }

    res.status(200).json({
      message: "Boq Project updated successfully",
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const deleteBoqProject = async (req, res) => {
  try {
    const { boqId, itemId } = req.params;
    const response = await boqProject.findOneAndUpdate(
      { _id: boqId },
      { $pull: { items: { _id: itemId } } },
      { new: true }
    );
    if (!response) {
      return res.status(404).json({
        message: "Boq Project or Item not found",
      });
    }
    res.status(200).json({
      message: "Boq Project item deleted successfully",
      data: response,
    });
    } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
    }
}

module.exports = {
  createBoqProject,
  getAllBoqProject,
  getBoqProjectById,
  updateBoqProject,
  deleteBoqProject
};
