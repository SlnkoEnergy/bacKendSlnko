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
      .json({ message: "Data fetched successfully", data: getmoduleMaster });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//edit module master data
const editmodulemaster =  async function (req, res) {
  try {
    let id = req.params._id;
    let updatedata = req.body
    if(!id){
      res.status(400).json({ message: "Id is required" });
    }
    let data = await modeulemsateerModel.findByIdAndUpdate(id, updatedata, { new: true });

    res.status(200).json({ message: "Data updated successfully", Data: data });

    } catch (error) {
    res.status(500).json({ message: error.message });
    
  }
};

//delete module master data
const deletemodulemaster = async function (req, res) {
  try {
    let id = req.params._id;
    if (!id) {
      res.status(400).json({ message: "Id is required" });
    }
    let Deletedata = await modeulemsateerModel.findByIdAndDelete(id);

    res.status(200).json({ message: "Data deleted successfully", data: Deletedata });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addmoduleMaster,
  getmoduleMasterdata,
  editmodulemaster,
  deletemodulemaster,
};