const vendorModells = require("../Modells/vendorModells");

const addVendor = async function (req, res) {
  try {
    let {
      id,

      name,

      Beneficiary_Name,

      Account_No,

      Bank_Name,

    
      IFSC_Code,
    } = req.body;

    const vendorexist = await vendorModells.findOne({
      name: name ,
    });

    if (vendorexist) {
      return res.status(400).json({ msg: "Vendor already exists!" });
    }
    const add_vendor = new vendorModells({
     id,
      name,

      Beneficiary_Name,

      Account_No,

      Bank_Name,

    
      IFSC_Code,
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
    });
  }
};



// Get all vendors
const getVendor = async function (req, res) {
  let data = await vendorModells.find();
  res.status(200).json({ msg: "all vendor", data });
};


module.exports = {
  addVendor,
  getVendor,
};
