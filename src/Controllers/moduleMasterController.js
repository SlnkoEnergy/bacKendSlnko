const modeulemsateerModel = require("../Modells/moduleMasterModells");

const addmoduleMaster = async function (req, res) {
  try {
    const {
      make,
      power,
      type,
      model,
      vmp,
      imp,
      voc,
      isc,
      alpha,
      beta,
      gamma,
      l,
      w,
      t,
      status,
      submitted_by,
    } = req.body;
    const modulemaster = new modeulemsateerModel({
      make,
      power,
      type,
      model,
      vmp,
      imp,
      voc,
      isc,
      alpha,
      beta,
      gamma,
      l,
      w,
      t,
      status,
      submitted_by,
    });
    await modulemaster.save();
    res
      .status(200)
      .json({ message: "Data saved successfully", Data: modulemaster });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//get all module master data
const getmoduleMasterdata = async function (req, res) {
  try {
    let getmoduleMaster = await modeulemsateerModel.find();
    res
      .status(200)
      .json({ message: "Data fetched successfully", Data: getmoduleMaster });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addmoduleMaster,
  getmoduleMasterdata,
};