const boqCategory = require("../../../Modells/EngineeringModells/boq/boqCategory");
const moduleTemplates = require("../../../Modells/EngineeringModells/engineeringModules/moduleTemplate");

const createBoqCategory = async (req, res) => {
  try {
    const { module_template } = req.query;

    const boqData = new boqCategory(req.body);
    await boqData.save();

    if (module_template) {
      await moduleTemplates.findByIdAndUpdate(
        module_template,
        {
          $addToSet: { "boq.template_category": boqData._id }, 
        },
        { new: true }
      );
    }

    res.status(201).json({
      message: "Boq Category created successfully",
      data: boqData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


const getBoqCategoryById = async (req, res) => {
  try {
    const BoqData = await boqCategory.findById(req.params._id);
    if (!BoqData) {
      return res.status(404).json({
        message: "Boq Category not found",
      });
    }
    res.status(200).json({
      message: "Boq Category Retrieved Successfully",
      data: BoqData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getBoqCategory = async(req, res)=>{
  try {
    const BoqData = await boqCategory.find();
    if(!BoqData || BoqData.length === 0) {
      return res.status(404).json({
        message: "No Boq Category found",
      });
    }
    res.status(200).json({
      message: "Boq Category Retrieved Successfully",
      data: BoqData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    })
  }
}

const updateBoqCategory = async (req, res) => {
  try {
    const data = await boqCategory.findByIdAndUpdate(
      req.params._id,
      req.body,
      { new: true}
    )

    if (!data) {
      return res.status(404).json({
        message: "Boq Category not found",
      });
    }
    res.status(200).json({
      message: "Boq Category updated successfully",
      data: data,
    });

  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

module.exports = {
  createBoqCategory,
  getBoqCategoryById,
  getBoqCategory,
  updateBoqCategory
};