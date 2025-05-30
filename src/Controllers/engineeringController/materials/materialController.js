const materialCategoryModells = require("../../../Modells/EngineeringModells/materials/materialCategoryModells");
const materialModells = require("../../../Modells/EngineeringModells/materials/materialModells");

const createMaterial = async function (req, res) {
  try {
    const { category, data, is_available } = req.body;
    const userId = req.user?._id;
    
    const existingCategory = await materialCategoryModells.findById(category);
    if (!existingCategory) {
      return res.status(404).json({
        message: "Material Category not found",
      })
    }
    const newMaterial = new materialModells({
      category,
      data,
      is_available,
      createdBy: userId,
      updatedBy: userId,
    });
    
    await newMaterial.save();
    res
      .status(201)
      .json({ message: "Material Created Successfully", data: newMaterial });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error Creating Material", error: error.message });
  }
};

// Get all materials
const getAllMaterials = async function (req, res) {
  try {
    const materials = await materialModells
      .find()
      .populate("category", "name description fields");
    res
      .status(200)
      .json({ message: "Materials retrieved successfully", data: materials });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving Materials", error: error.message });
  }
};

// Get material by ID
// const getMaterialById = async function (req, res) {
//   try {
//     const material = await materialModells
//       .findById(req.params.id)
//       .populate("category", "name description fields");
//     if (!material) {
//       return res.status(404).json({ message: "Material not found" });
//     }
//     res
//       .status(200)
//       .json({ message: "Material retrieved successfully", data: material });
//   } catch (error) {
//     res
//       .status(500)
//       .json({ message: "Error retrieving Material", error: error.message });
//   }
// };

// Update material
const updateMaterial = async function (req, res) {
  try {
    const { category, data } = req.body;
    const id = req.params._id;
    if (!id) {
      return res.status(400).json({ message: "Material ID is required" });
    }
    const updatedMaterial = await materialModells.findByIdAndUpdate(
      id,
      { category, data, updatedBy: id },
      { new: true }
    );
    if (!updatedMaterial) {
      return res.status(404).json({ message: "Material not found" });
    }
    res
      .status(200)
      .json({
        message: "Material updated successfully",
        data: updatedMaterial,
      });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating Material", error: error.message });
  }
};

// Delete material
const deleteMaterial = async function (req, res) {
  try {
    const id = req.params._id;
    if (!id) {
      return res.status(400).json({ message: "Material ID is required" });
    }
    const deletedMaterial = await materialModells.findByIdAndDelete(id);
    if (!deletedMaterial) {
      return res.status(404).json({ message: "Material not found" });
    }
    res
      .status(200)
      .json({
        message: "Material deleted successfully",
        data: deletedMaterial,
      });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting Material", error: error.message });
  }
};

// Export the functions
module.exports = {
  createMaterial,
  getAllMaterials,
  //getMaterialById,
  updateMaterial,
  deleteMaterial,
};
