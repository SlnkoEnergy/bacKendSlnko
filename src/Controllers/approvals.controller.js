const { default: mongoose } = require("mongoose");
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
    const userId = req.user.userId;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 1) All distinct model names
    const uniqueModels = await Approval.distinct("model_name");

    // 2) Counts only for the current user & pending
    const counts = await Approval.aggregate([
      {
        $match: {
          "current_approver.user_id": userObjectId,
          "current_approver.status": "pending",
        },
      },
      {
        $group: {
          _id: "$model_name",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          model_name: "$_id",
          count: 1,
        },
      },
    ]);

    // 3) Build response: { modelName: number }
    const countMap = counts.reduce((acc, { model_name, count }) => {
      acc[model_name] = count;
      return acc;
    }, {});

    const modelWise = {};
    for (const model of uniqueModels) {
      modelWise[model] = countMap[model] ?? 0;
    }

    return res.status(200).json(modelWise);
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


const updateStatus = async (req, res) => {
  try {
    const { approvalId } = req.params;
    const { status, remarks } = req.body;
    const userId = req.user.userId;
    console.log({ userId });
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
    const approver = approval.approvers.find(
      (a) => a.user_id && a.user_id.toString() === userId
    );

    if (!approver) {
      return res
        .status(404)
        .json({ message: "Approver not found for this user" });
    }

    approver.status = status;
    approver.remarks = remarks;
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
