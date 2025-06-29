const { default: mongoose } = require("mongoose");
const BoqTemplate = require("../../../Modells/EngineeringModells/boq/boqTemplate");
const ModuleTemplate = require("../../../Modells/EngineeringModells/engineeringModules/moduleTemplate");

const createBoqTemplate = async(req, res) => {
    try {
        const boqTemplate = new BoqTemplate(req.body);
        await boqTemplate.save();
        res.status(201).json({ message: "Boq Template created successfully", data: boqTemplate });

    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}


const getBoqTemplateByTemplateId = async (req, res) => {
  try {
    const { moduleTemplateId } = req.query;

    // Step 1: Find all BoqTemplates linked to this moduleTemplateId
    const boqTemplates = await BoqTemplate.find({ module_template: moduleTemplateId });

    if (!boqTemplates.length) {
      return res.status(404).json({ message: "No BoqTemplates found for this Module Template" });
    }

    const boqCategoryIds = boqTemplates.map(bt => bt.boq_category);

    // Step 2: Aggregate ModuleTemplate and match the relevant BoqCategories
    const moduleTemplate = await ModuleTemplate.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(moduleTemplateId) } },
      {
        $lookup: {
          from: "boqcategories",
          localField: "boq.template_category",
          foreignField: "_id",
          as: "boqCategories"
        }
      },
      {
        $addFields: {
          matchedCategories: {
            $filter: {
              input: "$boqCategories",
              as: "cat",
              cond: { $in: ["$$cat._id", boqCategoryIds] }
            }
          }
        }
      },
      {
        $project: {
          name: 1,
          description: 1,
          boq: 1,
          matchedCategories: 1
        }
      }
    ]);

    if (!moduleTemplate.length) {
      return res.status(404).json({ message: "Module Template not found" });
    }

    return res.status(200).json({
      message: "Data retrieved successfully",
      boqTemplates,
      moduleTemplate: moduleTemplate[0],
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};


const getBoqTemplate = async(req, res)=>{
    try {
        const boqTemplates = await BoqTemplate.find().populate('boq_category');
        if (!boqTemplates || boqTemplates.length === 0) {
            return res.status(404).json({ message: "No Boq Templates found" });
        }
        res.status(200).json({ message: "Boq Templates retrieved successfully", data: boqTemplates });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}

const updateBoqTemplate = async(req, res) => {
    try {
        const data = await BoqTemplate.findByIdAndUpdate(req.params._id, req.body, { new: true });
        if (!data) {
            return res.status(404).json({ message: "Boq Template not found" });
        }
        res.status(200).json({ message: "Boq Template updated successfully", data: data });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}


module.exports = {
    createBoqTemplate,
    getBoqTemplateByTemplateId,
    getBoqTemplate,
    updateBoqTemplate
};