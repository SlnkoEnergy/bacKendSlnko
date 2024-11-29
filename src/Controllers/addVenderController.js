const vendorModells = require("../Modells/vendorModells");

const addVendor = async function(req,res){
   try {
    
    let {
        vendorName,
       accountNumber,
        ifscCode,
        bankName


    }=req.body;
    const add_vendor = new vendorModells({
        vendorName,
       accountNumber,
        ifscCode,
        bankName
        
      });
  
      // Save the record to the database
      await add_vendor.save();
  
      // Send a success response
      return res.status(200).json({
        msg: "Vendor added successfully",
        data: add_vendor,
      });


   } catch (error) {
    res.status(400).json({
        msg: "Error addVendor project",
        error: error.message,
        validationErrors: error.errors, // Show validation errors if any
    
   })
}}
module.exports = {
    addVendor
}


