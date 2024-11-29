const projectModells = require("../Modells/projectModells");
const purchaseOrderModells = require("../Modells/purchaseOrderModells");

const addPo = async function (req, res) {
  try {
    const { project_ID, poNumber, date, item, other, poValue } = req.body;
    let checkProject = await projectModells.findOne({ project_ID: project_ID });
    if (!checkProject) {
      return res.status(400).json({ msg: "Project not found" });
    }
    const adpo = new purchaseOrderModells({
      project_ID,
      poNumber,
      date,
      item,
      other,
      poValue,
    });

    // Save the record to the database
    await adpo.save();

    // Send a success response
    return res.status(201).json({
      msg: "purchase order added successfully",
      data: adpo,
    });
  } catch (error) {
   
    res.status(400).json({
      msg: "Error saving project",
      error: error.message,
      validationErrors: error.errors, // Show validation errors if any
    });
  }
};


const editPO= async function (req,res) {
  let _id = req.params._id;
  let updateData = req.body;
  try {
    let update = await purchaseOrderModells.findByIdAndUpdate(_id, updateData, {
      new: true,
    });
    res.status(200).json({
      msg: "Project updated successfully",
      data: update, // Send back the updated project data
    });
  } catch (error) {
    res.status(400).json({ msg: "Server error", error: error.message });
  }
};
  

module.exports = {
    addPo,
    editPO
}