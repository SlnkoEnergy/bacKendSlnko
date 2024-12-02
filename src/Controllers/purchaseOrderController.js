const projectModells = require("../Modells/projectModells");
const purchaseOrderModells = require("../Modells/purchaseOrderModells");
const iteamModells= require("../Modells/iteamModells");
const moment = require("moment");


const addPo = async function (req, res) {
 


  try {
    const { p_id, date, item, other, po_number, po_value } = req.body;
 


    // Get project ID
    const project = await projectModells.findOne({ p_id : p_id });
    console.log(project);
    if (!project) {
      return res.status(404).send({ message: 'Project not found!' });
    }

    // const p_id = project.p_id;

    // Resolve item value
    let resolvedItem = item === 'Other' ? other : item;
       // Validate and format date using moment
       const formattedDate = moment(date, 'YYYY-MM-DD', true);
       if (!formattedDate.isValid()) {
         return res.status(400).send({ message: 'Invalid date format. Expected format: YYYY-MM-DD.' });
       }

    // Check partial billing
    const partialItem = await iteamModells.findOne({ item: resolvedItem });
    const partial_billing = partialItem ? partialItem.partial_billing : '';

    // Check if PO Number exists
    const existingPO = await purchaseOrderModells.findOne({ po_number });
    if (existingPO) {
      return res.status(400).send({ message: 'PO Number already used!' });
    }

    // Add new Purchase Order
    const newPO = new purchaseOrderModells({
      p_id,
      po_number,
      date:formattedDate.format('YYYY-MM-DD'),
      item: resolvedItem,
      po_value,
   
      partial_billing,
    });

    await newPO.save();

    res.status(200).send({
      message: 'Purchase Order has been added successfully!',
      
      newPO
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'An error occurred while processing your request.' });
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

const getPO = async function(req,res){
  let id =req.params._id;
  let data = await purchaseOrderModells.findById(id);
  res.status(200).json(data)
};

const getallpo= async function(req,res) {
  let data= await purchaseOrderModells.find();
  res.send(data);
  
}

  

module.exports = {
    addPo,
    editPO,
    getPO,
    getallpo,
}