const { default: mongoose } = require("mongoose");
const boqProject = require("../Modells/boqproject.model");

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
    const { projectId, module_template } = req.query;
    
    const matchStage = {
      project_id: new mongoose.Types.ObjectId(projectId),
    };

    const response = await boqProject.aggregate([
      { $match: matchStage },
      { $unwind: "$items" },
      {
        $match: {
          "items.module_template": new mongoose.Types.ObjectId(module_template),
        },
      },
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
        $addFields: {
          "items.boqCategoryDetails": "$boqCategoryDetails",
        },
      },
      {
        $group: {
          _id: "$_id",
          project_id: { $first: "$project_id" },
          items: { $push: "$items" },
        },
      },
      {
        $addFields: {
          items: {
            $sortArray: {
              input: "$items",
              sortBy: { "boqCategoryDetails.name": 1 } 
            }
          }
        }
      }
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

const getBoqProjectByProject = async (req, res) => {
  try {
    const { projectId } = req.query;

    const data = await boqProject.aggregate([
      {
        $match: {
          project_id: new mongoose.Types.ObjectId(projectId),
        },
      },
      {
        $unwind: "$items",
      },
      {
        $lookup: {
          from: "boqtemplates",
          localField: "items.boq_template",
          foreignField: "_id",
          as: "boqTemplate",
        },
      },
      {
        $unwind: "$boqTemplate",
      },
      {
        $lookup: {
          from: "boqcategories",
          localField: "boqTemplate.boq_category",
          foreignField: "_id",
          as: "boqCategory",
        },
      },
      {
        $unwind: "$boqCategory",
      },
      {
        $project: {
          _id: 0,
          boq_category_name: "$boqCategory.name",
          item: "$items",
        },
      },
    ]);

    res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching BOQ project data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};




const updateBoqProject = async (req, res) => {
  try {
    const { projectId, moduleTemplateId } = req.params;

    const boq = await boqProject.findOne({
      project_id: projectId,
      "items.module_template": moduleTemplateId,
    });

    if (!boq) {
      return res.status(404).json({
        message: "Boq Project not found",
      });
    }

    const item = boq.items.find(
      (i) => i.module_template.toString() === moduleTemplateId
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
  getBoqProjectByProject,
  updateBoqProject,
  deleteBoqProject
};
