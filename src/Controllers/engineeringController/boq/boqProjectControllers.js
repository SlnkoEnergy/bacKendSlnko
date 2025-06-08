const { default: mongoose } = require("mongoose");
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
      .populate("items.boq_template")
      .populate("items.module_template");
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
    const { projectId} = req.query;

    const response = await boqProject.aggregate([
      {
        $match: {
          project_id: new mongoose.Types.ObjectId(projectId),
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "boqtemplates",
          localField: "items.boq_template",
          foreignField: "_id",
          as: "boqTemplateDetails",
        },
      },
      { $unwind: "$boqTemplateDetails" },
      {
        $lookup: {
          from: "boqcategories",
          localField: "boqTemplateDetails.boq_category",
          foreignField: "_id",
          as: "boqCategoryDetails",
        },
      },
      { $unwind: { path: "$boqCategoryDetails", preserveNullAndEmptyArrays: true } },
      {
        // Merge boqTemplateDetails and boqCategoryDetails into each item
        $addFields: {
          "items.boqCategoryDetails": "$boqCategoryDetails",
        },
      },
      {
        // Group back all items into an array to reconstruct the document
        $group: {
          _id: "$_id",
          project_id: { $first: "$project_id" },
          items: { $push: "$items" },
        },
      },
    ]);

    if (!response.length) {
      return res.status(404).json({ message: "No Boq Project found with provided IDs" });
    }

    res.status(200).json({
      message: "Boq Project with category fetched successfully",
      data: response[0],
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
    const { projectId, BoqtemplateId } = req.params;

    const boq = await boqProject.findOne({
      project_id: projectId,
      "items.boq_template": BoqtemplateId,
    });

    if (!boq) {
      return res.status(404).json({
        message: "Boq Project not found",
      });
    }

    const item = boq.items.find(
      (i) => i.boq_template.toString() === BoqtemplateId
    );

    if (!item) {
      return res.status(404).json({
        message: "Matching item not found",
      });
    }

    item.data_history.push(req.body.data);
    await boq.save();

    await boq.populate("project_id");
    await boq.populate("items.boq_template");
    await boq.populate("items.module_template");

    res.status(200).json({
      message: "Boq Project updated successfully",
      data: boq,
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
