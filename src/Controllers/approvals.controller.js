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
    const userId = req.user.userId;
    // In the response model_wise give count of reviews required by the user for that check current_approver.user_id
    const modelWise = {};
    for (const model of uniqueModels) {
      const count = await Approval.countDocuments({
        model_name: model,
        "current_approver.user_id": userId,
        "current_approver.status": "pending",
      });
      modelWise[model] = count;
    }
    res.status(200).json({
      uniqueModels,
      modelWise,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { approvalId, status, remarks } = req.body;
    const userId = req.user.userId;
    const approval = await Approval.findById(approvalId);
    if (!approval) {
      return res.status(404).json({ message: "Approval not found" });
    }
    const currentApprover = approval.current_approver;
    if (currentApprover.user_id.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You are not the current approver" });
    }
    if (currentApprover.status !== "pending") {
      return res
        .status(400)
        .json({ message: "You have already acted on this approval" });
    }
    approval.approvers.find(
      (approver) => approver.user_id.toString() === userId
    ).status = status;
    approval.approvers.find(
      (approver) => approver.user_id.toString() === userId
    ).remarks = remarks;
    await approval.save();
    res.status(200).json({ message: "Approval status updated successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getAllRequests = async (req, res) => {
  try {
    // Add Pagination, limit and search by createdAt, createdBy and also filter by model_name
    const {
      page = 1,
      limit = 10,
      search = "",
      model_name,
      createdAtFrom,
      createdAtTo,
    } = req.query;
    const query = {
      $or: [{ "created_by.name": { $regex: search, $options: "i" } }],
    };
    // Add external filters
    if (model_name) {
      query.model_name = model_name;
    }
    if (createdAtFrom || createdAtTo) {
      query.createdAt = {};
      if (createdAtFrom) {
        query.createdAt.$gte = new Date(createdAtFrom);
      }
      if (createdAtTo) {
        query.createdAt.$lte = new Date(createdAtTo);
      }
    }
    const requests = await Approval.find(query)
      .populate("created_by", "name email")
      .populate("approvers.user_id", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Approval.countDocuments(query);
    res.status(200).json({
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      requests,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getAllReviews = async (req, res) => {
  try {
    // Add Pagination, limit and search by createdAt, createdBy and also filter by model_name
    const {
      page = 1,
      limit = 10,
      search = "",
      model_name,
      createdAtFrom,
      createdAtTo,
    } = req.query;
    const userId = req.user.userId;
    // check on approvers not on current_approver
    // because if user has already approved/rejected then current_approver will be next approver
    // but user should be able to see the request in reviews
    // so that he can see the status of his approval/rejection
    const query = {
      $or: [
        { "created_by.name": { $regex: search, $options: "i" } },
        // Approvers array user_id match
        { "approvers.user_id": userId },
      ],
    };
    // Add external filters
    if (model_name) {
      query.model_name = model_name;
    }
    if (createdAtFrom || createdAtTo) {
      query.createdAt = {};
      if (createdAtFrom) {
        query.createdAt.$gte = new Date(createdAtFrom);
      }
      if (createdAtTo) {
        query.createdAt.$lte = new Date(createdAtTo);
      }
    }
    const reviews = await Approval.find(query)
      .populate("created_by", "name email")
      .populate("approvers.user_id", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Approval.countDocuments(query);
    res.status(200).json({
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      reviews,
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
  updateStatus,
  getAllRequests,
  getAllReviews,
};
