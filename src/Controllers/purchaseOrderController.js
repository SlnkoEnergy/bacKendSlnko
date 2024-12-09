const projectModells = require("../Modells/projectModells");
const purchaseOrderModells = require("../Modells/purchaseOrderModells");
const iteamModells= require("../Modells/iteamModells");
const moment = require("moment");
const { Parser } = require("json2csv");
const fs = require("fs");
const path = require("path");





const addPo = async function (req, res) {
 


  try {
    const { p_id, date, item, other, po_number, po_value,vendor } = req.body;
 


    // Get project ID
    const project = await projectModells.find({ p_id : p_id });
   
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
      date:formattedDate.format('DD-MM-YYYY'),
      item: resolvedItem,
      po_value,
      vendor,
      other,
   
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
 let data =await purchaseOrderModells.find()
 res.status(200).json({msg:"all po",data})
  };

  const exportCSV = async function(req,res){
    try {
      // Fetch data from MongoDB
      const users = await purchaseOrderModells.find().lean(); // Use `.lean()` to get plain JS objects
      // console.log(users);
  
      if (users.length === 0) {
        return res.status(404).send("No data found to export.");
      }
  
      // Specify fields for CSV
      const fields = [ "p_id", "date", "item", "other", "po_number"," po_value"];
      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(users);
  
      // Save CSV to a file
      const filePath = path.join(__dirname, "exports", "users.csv");
      fs.mkdirSync(path.dirname(filePath), { recursive: true }); // Ensure the directory exists
      fs.writeFileSync(filePath, csv);
  
      // Send CSV file to client
      res.download(filePath, "users.csv", (err) => {
        if (err) {
          console.error(err);
          res.status(500).send("Error while downloading the file.");
        } else {
          console.log("File sent successfully.");
        }
      });
    } catch (error) {
      console.error("Error exporting to CSV:", error);
      res.status(500).send("An error occurred while exporting the data.");
    }

  }
  
  


  

module.exports = {
    addPo,
    editPO,
    getPO,
    getallpo,
    exportCSV,
}