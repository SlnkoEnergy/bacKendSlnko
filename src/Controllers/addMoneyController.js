const addMoneyModells = require("../Modells/addMoneyModells");
const projectModells = require("../Modells/projectModells");

const addMoney = async function (req, res) {
  try {
    const {
      p_id,
      submitted_by,
      cr_amount,
      cr_mode,
      cr_date,

      comment,
    } = req.body;

    // Check if the project exists
    let checkProject = await projectModells.find({ p_id: p_id });
    if (!checkProject) {
      return res.status(400).json({ msg: "Project not found" });
    }

    // Create the money addition record
    const admoney = new addMoneyModells({
      p_id,
      submitted_by,
      cr_amount,
      cr_date,

      cr_mode,

      comment,
    });

    // Save the record to the database
    await admoney.save();

    // Send a success response
    return res.status(201).json({
      msg: "Money added successfully",
      data: admoney,
    });
  } catch (error) {
    // Handle errors
    console.error(error); // Log the actual error for debugging
    return res.status(400).json({ msg: "Server error", error: error.message });
  }
};



const  getCreditAmount = async function (req,res) {
  const{p_id}=req.params.p_id;
  try {
    // Fetch records from the database
    const records = await addMoneyModells.find({ p_id });
    console.log(records);

    if (records.length === 0) {
        return res.status(404).json({ message: 'No records found' });
    }

    // Calculate the total credit amount
    const totalCreditAmount = records.reduce((total, record) => total + (record.cr_amount || 0), 0);

    res.json({ totalCreditAmount, records });
} catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ message: 'Internal server error' });
} 
}

module.exports = {
  addMoney,
  getCreditAmount,
};
