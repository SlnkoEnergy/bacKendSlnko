const { default: mongoose } = require("mongoose");
const Approval = require("../models/approvals.model");
const User = require("../models/user.model");
const Project = require("../models/project.model");

const createApproval = async (req, res) => {
  try {
    const data = req.body;
    const newApproval = new Approval({ ...data, created_by: req.user.userId });
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

const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getAllRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      model_name,
      createdAtFrom,
      createdAtTo,
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);

    // ---------- BASE FILTERS ----------
    const andFilters = [];

    if (model_name) andFilters.push({ model_name });

    if (createdAtFrom || createdAtTo) {
      const range = {};
      if (createdAtFrom) range.$gte = new Date(createdAtFrom);
      if (createdAtTo) {
        const to = new Date(createdAtTo);
        if (!createdAtTo.includes("T")) to.setHours(23, 59, 59, 999);
        range.$lte = to;
      }
      andFilters.push({ createdAt: range });
    }

    // ---------- TEXT SEARCH on creator (name/email) ----------
    if (search && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), "i");
      const creators = await User.find(
        { $or: [{ name: rx }, { email: rx }] },
        { _id: 1 }
      ).lean();

      if (creators.length) {
        andFilters.push({ created_by: { $in: creators.map((u) => u._id) } });
      } else {
        return res.status(200).json({
          page: pageNum,
          limit: limitNum,
          total: 0,
          requests: [],
        });
      }
    }

    // ---------- ROLE / DEPT SCOPING ----------
    const { user } = await User.findById(req.user.userId);
    const userId = user?._id;
    const department = user?.department;
    const role = user?.role;
    const name = user?.name;

    const isPrivileged =
      (department && ["admin", "superadmin"].includes(department.toLowerCase())) ||
      name === "Prachi Singh";

    if (!isPrivileged) {
      if (role && role.toLowerCase() === "manager" && department) {
        const deptUsers = await User.find({ department }, { _id: 1 }).lean();
        const allowedIds = new Set([
          ...(deptUsers?.map((u) => String(u._id)) || []),
          String(userId || ""),
        ]);
        andFilters.push({ created_by: { $in: Array.from(allowedIds) } });
      } else {
        andFilters.push({ created_by: userId });
      }
    }

    const finalQuery = andFilters.length ? { $and: andFilters } : {};

    // ---------- MAIN QUERY (no populate on model_id) ----------
    const [requests, total] = await Promise.all([
      Approval.find(finalQuery)
        .populate("created_by", "_id name")
        .populate("approvers.user_id", "_id name attachment_url")
        .populate("current_approver.user_id", "_id name attachment_url")
        .populate("model_id", "project_id")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Approval.countDocuments(finalQuery),
    ]);

    const projectIdSet = new Set();
    for (const r of requests) {
      const maybeId = r?.model_id?.project_id;
      if (maybeId && mongoose.Types.ObjectId.isValid(String(maybeId))) {
        projectIdSet.add(String(maybeId));
      }
    }

    let projectMap = new Map();
    if (projectIdSet.size) {
      const projects = await Project.find(
        { _id: { $in: Array.from(projectIdSet).map((id) => new mongoose.Types.ObjectId(id)) } },
        { _id: 1, code: 1, name: 1 }
      ).lean();

      projectMap = new Map(projects.map((p) => [String(p._id), p]));
    }

    // ---------- ATTACH { _id, code, name } ----------
    const requestsWithProject = requests.map((r) => {
      const pid = r?.model_id?.project_id ? String(r.model_id.project_id) : null;
      const proj = pid ? projectMap.get(pid) : null;

      return {
        ...r,
        project: proj
          ? { _id: proj._id, code: proj.code, name: proj.name }
          : null,
      };
    });

    return res.status(200).json({
      page: pageNum,
      limit: limitNum,
      total,
      requests: requestsWithProject,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getAllReviews = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      model_name,
      createdAtFrom,
      createdAtTo,
    } = req.query;
    const userId = req.user.userId;
    const query = {
      $or: [
        { "created_by.name": { $regex: search, $options: "i" } },
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
