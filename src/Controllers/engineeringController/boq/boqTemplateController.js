const boqTemplates = require("../../../Modells/EngineeringModells/boq/boqTemplates");

const createBoqTemplate = async (req, res) => {
  try {
    const BoqData = new boqTemplates(req.body);

    await BoqData.save();
    res.status(201).json({
      message: "Boq Template created successfully",
      data: BoqData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

const getBoqTemplateById = async (req, res) => {
  try {
    const BoqData = await boqTemplates.findById(req.params._id).populate("module_template");
    res.status(200).json({
      message: "Boq Template Retrieved Successfully",
      data: BoqData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getBoqTemplate = async(req, res)=>{
  try {
    const BoqData = await boqTemplates.find().populate("module_template");
    res.status(200).json({
      message: "Boq Template Retrieved Successfully",
      data: BoqData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    })
  }
}

module.exports = {
  createBoqTemplate,
  getBoqTemplateById,
  getBoqTemplate
};