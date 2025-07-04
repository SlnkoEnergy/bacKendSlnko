const mongoose = require("mongoose");

const MaterialSupply = require("../../Modells/MaterialSupply/material-supply");

const CreateMaterialSupply = async (req, res) => {
  try {
    const { materialData } = req.body;

    if (!materialData) {
      return res.status(400).json({ message: "Material data is required" });
    }

    const newMaterial = new MaterialSupply({
      ...materialData,

      createdBy: req.user.userId,
    });

    await newMaterial.save();

    return res.status(201).json({
      message: "Material Added Successfully",
      data: newMaterial,
    });
  } catch (error) {
    console.error("Error Creating Material:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getAllMaterial = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const skip = (page - 1) * limit;

    const matchStage = search
      ? {
          $or: [
            { pr_no: { $regex: search, $options: "i" } },
            { "project_id.name": { $regex: search, $options: "i" } },
            { "item_id.name": { $regex: search, $options: "i" } },
            { "po_id.po_number": { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const basePipeline = [
      {
        $lookup: {
          from: "projectdetails",
          localField: "project_id",
          foreignField: "_id",
          as: "project_id",
        },
      },
      { $unwind: { path: "$project_id", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "materialcategories",
          localField: "item_id",
          foreignField: "_id",
          as: "item_id",
        },
      },
      { $unwind: { path: "$item_id", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "purchaseorders",
          localField: "po_id",
          foreignField: "_id",
          as: "po_id",
        },
      },
      { $unwind: { path: "$po_id", preserveNullAndEmptyArrays: true } },
      {
        $unwind: { path: "$scope_history", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "users",
          localField: "scope_history.user_id",
          foreignField: "_id",
          as: "scope_history.user",
        },
      },
      {
        $unwind: {
          path: "$scope_history.user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$_id",
          project_id: { $first: "$project_id" },
          item_id: { $first: "$item_id" },
          po_id: { $first: "$po_id" },
          pr_no: { $first: "$pr_no" },
          etd: { $first: "$etd" },
          delivery_date: { $first: "$delivery_date" },
          scope_history: {
            $push: {
              status: "$scope_history.status",
              remarks: "$scope_history.remarks",
              user: "$scope_history.user",
            },
          },
        },
      },
      { $match: matchStage },
    ];

    const projectionStage = {
      $project: {
        "project_id.name": 1,
        "project_id.code": 1,
        "item_id.name": 1,
        "po_id.po_number": 1,
        "po_id.po_value": 1,
        "po_id.amount_paid": 1,
        pr_no: 1,
        etd: 1,
        delivery_date: 1,
        scope_history: {
          status: 1,
          remarks: 1,
          "user.name": 1,
        },
      },
    };

    const materialsPipeline = [
      ...basePipeline,
      projectionStage,
      { $sort: { etd: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ];

    const countPipeline = [...basePipeline, { $count: "total" }];

    const [materials, totalCountArr] = await Promise.all([
      MaterialSupply.aggregate(materialsPipeline),
      MaterialSupply.aggregate(countPipeline),
    ]);

    const totalItems = totalCountArr[0]?.total || 0;

    res.status(200).json({
      data: materials,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
    });
  } catch (error) {
    console.error("Error fetching materials:", error);
    res
      .status(500)
      .json({ error: "Internal Server error", message: error.message });
  }
};

const getMaterialSupplyById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Material ID" });
    }

    const material = await MaterialSupply.findById(id)
      .populate({
        path: "project_id",
        select: "name code", // adjust fields as needed
      })
      .populate({
        path: "item_id",
        select: "name",
      })
      .populate({
        path: "po_id",
        select: "po_number po_value amount_paid",
      })
      .populate({
        path: "scope_history.user_id",
        select: "name",
      });

    if (!material) {
      return res.status(404).json({ message: "Material not found" });
    }

    return res.status(200).json({
      message: "Material retrieved successfully",
      data: material,
    });
  } catch (error) {
    console.error("Error fetching material by ID:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const UpdateMaterialSupply = async (req, res) => {
  try {
    const { id } = req.params;
    const { materialData } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Material ID" });
    }

    const updatedMaterial = await MaterialSupply.findByIdAndUpdate(
      id,
      materialData,
      { new: true }
    );

    if (!updatedMaterial) {
      return res.status(404).json({ message: "Material not found" });
    }

    return res.status(200).json({
      message: "Material supply updated successfully",
      data: updatedMaterial,
    });
  } catch (error) {
    console.error("Error updating Material Supply:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const updateMaterialSupplyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status,remarks } = req.body;

    if (!id || !status || !remarks) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const material = await MaterialSupply.findById(id);
    if (!material) {
      return res.status(404).json({ message: "Material Supply record not found" });
    }

    material.scope_history.push({
      status,
      remarks,
      user_id: req.user.userId
    });


    await material.save();

    res.status(200).json({
      message: "Material Supply status updated successfully",
      data: material,
    });
  } catch (error) {
    console.error("Error updating Material Supply status:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};


const deleteMaterialSupply = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Material ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Material ID" });
    }

    const material = await MaterialSupply.findByIdAndDelete(id);

    if (!material) {
      return res.status(404).json({ message: "Material not found" });
    }

    return res.status(200).json({
      message: "Material supply deleted successfully",
      data: material,
    });
  } catch (error) {
    console.error("Error deleting Material Supply:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  CreateMaterialSupply,
  getAllMaterial,
  getMaterialSupplyById,
  UpdateMaterialSupply,
  deleteMaterialSupply,
  updateMaterialSupplyStatus,
};
