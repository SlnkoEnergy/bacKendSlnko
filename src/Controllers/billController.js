const addBillModells=require("../Modells/billDetailModells");
const projectModells =require("../Modells/projectModells");

const addBill = async function (req, res) {
    try {
      const { 
        id, 
        po_number, 
        bill_number, 
        bill_date, 
        bill_value, 
        type, 
        status, 
        submitted_by, 
        approved_by, 
        created_on 
      } = req.body;
      const project = await projectModells.findOne({ p_id:p_id})
      if (!project) {
        return res.status(400).json({ msg: "Project not found" });
      }
  
      // Create a new document
      const newBill = new addBillModells({
        id,
        po_number,
        bill_number,
        bill_date,
        bill_value,
        type,
        status,
        submitted_by,
        approved_by,
        created_on
      });
  
      // Save to database
      const savedBill = await newBill.save();
      res.status(201).json({
        message: 'Bill saved successfully!',
        data: savedBill
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ 
        message: 'An error occurred while saving the bill.', 
        error: error.message 
      });
    }
  };
module.exports={
    addBill
}

