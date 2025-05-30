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
    if (!BoqData) {
      return res.status(404).json({
        message: "Boq Template not found",
      });
    }
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
    if(!BoqData || BoqData.length === 0) {
      return res.status(404).json({
        message: "No Boq Templates found",
      });
    }
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

const updateBoqTemplate = async (req, res) => {
  try {
    const data = await boqTemplates.findByIdAndUpdate(
      req.params._id,
      req.body,
      { new: true}
    )

    if (!data) {
      return res.status(404).json({
        message: "Boq Template not found",
      });
    }
    res.status(200).json({
      message: "Boq Template updated successfully",
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
  createBoqTemplate,
  getBoqTemplateById,
  getBoqTemplate,
  updateBoqTemplate
};