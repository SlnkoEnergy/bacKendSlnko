const boqModels = require("../../../Modells/EngineeringModells/boq/boqModels");
const materialCategoryModells = require("../../../Modells/EngineeringModells/materials/materialCategoryModells.js");
const projectModells = require("../../../Modells/projectModells.js");

// Adding Boq Items
const addBoq = async function (req, res) {
  try {
    // Destructure the request body
    const {
      p_id,
      class_items,
      category,
      item_name,
      rating,
      technical_specification,
      tentative_make,
      quantity,
      uom,
      scope,
      final_make,
      status,
    } = req.body;
    const userId = req.user?._id;
    // Check if all required fields are present
    if (
      !p_id ||
      !class_items ||
      !category ||
      !item_name ||
      !rating ||
      !technical_specification ||
      !tentative_make ||
      !quantity ||
      !uom ||
      !status
    ) {
      return res.status(400).json({
        message: "Please provide all required fields",
      });
    }

    // check if project exists
    const existingProject = await projectModells.findOne({ p_id: p_id });
    if (!existingProject) {
      return res.status(404).json({
        message: "Project Not found",
      });
    }
    // Check if the category exists
    const existingCategory = await materialCategoryModells.findOne({
      name: category,
    });
    if (!existingCategory) {
      return res.status(404).json({
        message: "Material Category not found",
      });
    }
    // save the boq data
    const boqData = new boqModels({
      p_id,
      class_items,
      category,
      item_name,
      rating,
      technical_specification,
      tentative_make,
      quantity,
      uom,
      scope,
      final_make,
      status,
      createdBy: userId,
      updatedBy: userId,
    });

    await boqData.save();

    // Send a success response
    res.status(201).json({
      message: "Boq Created Successfully",
      data: boqData,
    });
  } catch (error) {
    // Handle errors
    res.status(500).json({
      message: "Error Creating Boq",
      error: error.message,
    });
  }
};

// Get Data for Boq Sheet
const getBoqsByProject = async (req, res) => {
  try {
    const { p_id, page = 1, limit = 10, search = "" } = req.query;

    if (!p_id) {
      return res.status(400).json({ message: "Project Id is required" });
    }

    // Validate page and limit numbers
    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 100); // max limit 100 for safety

    // Clean search string (remove quotes and trim)
    const cleanSearch = String(search)
      .replace(/^"+|"+$/g, "")
      .trim();

    // Base query with project id
    const query = { p_id };

    // Add search conditions only if search is not empty
    if (cleanSearch !== "") {
      query.$or = [
        { class_items: { $regex: cleanSearch, $options: "i" } },
        { category: { $regex: cleanSearch, $options: "i" } },
        { item_name: { $regex: cleanSearch, $options: "i" } },
        { tentative_make: { $regex: cleanSearch, $options: "i" } },
        { rating: { $regex: cleanSearch, $options: "i" } },
        { final_make: { $regex: cleanSearch, $options: "i" } },
        { technical_specification: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    // Count total documents matching query
    const total = await boqModels.countDocuments(query);

    // Fetch documents with pagination and sorting by createdAt descending
    const boqs = await boqModels
      .find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    // Send a success response
    res.status(200).json({
      message: "Boqs fetched successfully",
      total,
      page: pageNum,
      limit: limitNum,
      data: boqs,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching Boqs",
      error: error.message,
    });
  }
};

//Update Boq By Project
const updateBoqById = async (req, res) => {
  try {
    // get id from URL params
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user?._id;

    if (!id) {
      return res.status(400).json({ message: "Boq ID is required" });
    }

    // Set updatedBy field to current user id if available
    if (userId) {
      updateData.updatedBy = userId;
    }

    // Update the document and return the new updated document
    const updatedBoq = await boqModels.findByIdAndUpdate(id, updateData, {
      new: true, // return updated document
    });

    if (!updatedBoq) {
      return res.status(404).json({ message: "Boq not found" });
    }
    // Send a success response
    res.status(200).json({
      message: "Boq updated successfully",
      data: updatedBoq,
    });
  } catch (error) {
    // Handle errors
    res.status(500).json({
      message: "Error updating Boq",
      error: error.message,
    });
  }
};

// Delete Boq Items
const deleteBoqById = async (req, res) => {
  try {
    
    // get id from URL params
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Boq ID is required" });
    }
    // Find By Id for deleting
    const deletedBoq = await boqModels.findByIdAndDelete(id);

    // If Boq not present
    if (!deletedBoq) {
      return res.status(404).json({ message: "Boq not found" });
    }

    // Success Response
    res.status(200).json({
      message: "Boq deleted successfully",
      data: deletedBoq,
    });
  } catch (error) {
    // Handle Errors
    res.status(500).json({
      message: "Error deleting Boq",
      error: error.message,
    });
  }
};

module.exports = {
  addBoq,
  getBoqsByProject,
  updateBoqById,
  deleteBoqById,
};
