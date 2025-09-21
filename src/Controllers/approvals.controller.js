const Approval = require("../models/approvals.model");

const createApproval = async (req, res) => {
  try {
    const data = req.body;
    const newApproval = new Approval({ ...data, createdBy: req.user.userId });
    await newApproval.save();
    res.status(201).json({
      message: "Approval created successfully",
      newApproval,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getUniqueApprovalModels = async (req, res) => {
  try {
    const uniqueModels = await Approval.distinct("model_name");
    res.status(200).json({
      message: "Unique Approval Models Retrieved Successfully",
      data: uniqueModels,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  createApproval,
  getUniqueApprovalModels,
};
