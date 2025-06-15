const materialCategory = require("../../Modells/EngineeringModells/materialCategoryModells");

const addMaterialCategory = async (req, res) => {
  try {
    const { name, description, fields } = req.body;
    const userId = req.user?._id;

    const newMaterialCategory = new materialCategory({
      name,
      description,
      fields,
      createdBy: userId,
      updatedBy: userId,
    });

    await newMaterialCategory.save();
    res
      .status(201)
      .json({
        message: "Material Category added successfully",
        data: newMaterialCategory,
      });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Error adding Material Category",
        error: error.message,
      });
  }
};

// Get all material categories
const getAllMaterialCategories = async (req, res) => {
  try {
    const materialCategories = await materialCategory
      .find()
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");
    res
      .status(200)
      .json({
        message: "Material Categories retrieved successfully",
        data: materialCategories,
      });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Error retrieving Material Categories",
        error: error.message,
      });
  }
};

// Update material category
const updateMaterialCategory = async (req, res) => {
  try {
    const { name, description, fields } = req.body;
    const id = req.params._id;

    const updatedMaterialCategory = await materialCategory.findByIdAndUpdate(
      id,

      { name, description, fields, updatedBy: id },
      { new: true }
    );

    if (!updatedMaterialCategory) {
      return res.status(404).json({ message: "Material Category not found" });
    }

    res
      .status(200)
      .json({
        message: "Material Category updated successfully",
        data: updatedMaterialCategory,
      });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Error updating Material Category",
        error: error.message,
      });
  }
};
// Delete material category
const deleteMaterialCategory = async (req, res) => {
  try {
    const id = req.params._id;
    const deletedMaterialCategory =
      await materialCategory.findByIdAndDelete(id);
    if (!deletedMaterialCategory) {
      return res.status(404).json({ message: "Material Category not found" });
    }
    res
      .status(200)
      .json({
        message: "Material Category deleted successfully",
        data: deletedMaterialCategory,
      });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Error deleting Material Category",
        error: error.message,
      });
  }
};
module.exports = {
  addMaterialCategory,
  getAllMaterialCategories,
  //getMaterialCategoryById,
  updateMaterialCategory,
  deleteMaterialCategory,
};
