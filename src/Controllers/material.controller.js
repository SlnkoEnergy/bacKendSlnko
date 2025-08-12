const materialCategoryModells = require("../Modells/materialcategory.model");
const materialModells = require("../Modells/material.model");
const materialCounter = require("../Modells/materialcounter.model")

const createMaterial = async function (req, res) {
  try {
    const { category, data, is_available } = req.body;
    const userId = req.user?.userId;
    
    const existingCategory = await materialCategoryModells.findById(category);
    if (!existingCategory) {
      return res.status(404).json({ message: "Material Category not found" });
    }
    
    const counter = await materialCounter.findOneAndUpdate(
      { name: "material_sku" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    const nextSkuCode = `SKU${String(counter.seq).padStart(4, "0")}`;

    const newMaterial = new materialModells({
      category,
      sku_code: nextSkuCode,
      data,
      is_available,
      createdBy: userId,
      updatedBy: userId,
    });

    await newMaterial.save();

    res.status(201).json({
      message: "Material Created Successfully",
      data: newMaterial
    });

  } catch (error) {
    res.status(500).json({
      message: "Error Creating Material",
      error: error.message
    });
  }
};

// Get all materials
const getAllMaterials = async function (req, res) {
  try {
    const { category, page = 1, limit = 10, offset } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skipNum = offset !== undefined ? parseInt(offset, 10) : (pageNum - 1) * limitNum;

    const filter = category ? { category } : {};

    const [materials, total] = await Promise.all([
      materialModells
        .find(filter)
        .populate("category", "name description fields")
        .skip(skipNum)
        .limit(limitNum),
      materialModells.countDocuments(filter)
    ]);

    res.status(200).json({
      message: "Materials retrieved successfully",
      data: materials,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        offset: skipNum,
        totalPages: Math.ceil(total / limitNum),
        hasNextPage: skipNum + materials.length < total,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      message: "Error retrieving Materials",
      error: error.message
    });
  }
};



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
  updateMaterial,
  deleteMaterial,
};
