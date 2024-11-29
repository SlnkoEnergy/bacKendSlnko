const addMoneyModells = require("../Modells/addMoneyModells");
const projectModells = require("../Modells/projectModells");

const addMoney = async function (req, res) {
  try {
    const {
      p_id,
      projectGroup,
      crediteAmount,
      crediteMode,
      comment,
      submittedBy,
    } = req.body;

    // Check if the project exists
    let checkProject = await projectModells.findOne({ p_id: p_id });
    if (!checkProject) {
      return res.status(400).json({ msg: "Project not found" });
    }

    // Create the money addition record
    const admoney = new addMoneyModells({
      p_id,
      projectGroup,
      crediteAmount,
      crediteMode,
      comment,
      submittedBy,
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

module.exports = {
  addMoney,
};
