const { default: mongoose } = require("mongoose");
const Approval = require("../models/approvals.model");
const User = require("../models/user.model");
const Project = require("../models/project.model");
const approvalscounterModel = require("../models/approvalscounter.model");

const pad4 = (n) => String(n).padStart(4, "0");

const createApproval = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId).select("emp_id");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const counterDoc = await approvalscounterModel.findOneAndUpdate(
      { user_id: userId },
      { $inc: { count: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const seq = pad4(counterDoc.count);

    const prefix = "APR";
    const empId = user.emp_id || "NA";
    const approvalCode = `${prefix}/${empId}/${seq}`;

    const payload = {
      ...req.body,
      approval_code: approvalCode,
      created_by: userId,
    };
    const newApproval = await Approval.create(payload);

    return res.status(201).json({
      message: "Approval created successfully",
      approval: newApproval,
    });
  } catch (error) {
    return res.status(500).json({
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

const toObjectId = (v) => {
  if (!v) return null;
  if (v instanceof mongoose.Types.ObjectId) return v;
  if (typeof v === "object" && v._id) return toObjectId(v._id);
  const s = String(v);
  return mongoose.Types.ObjectId.isValid(s)
    ? new mongoose.Types.ObjectId(s)
    : null;
};

const modelExists = (name) => mongoose.modelNames().includes(String(name));

async function fetchDependencyRefById(modelName, modelId, depId, actId = null) {
  if (!modelExists(modelName) || !modelId || !depId) return null;
  const Model = mongoose.model(modelName);

  const pipeline = [{ $match: { _id: modelId } }, { $unwind: "$activities" }];

  if (actId) {
    pipeline.push({ $match: { "activities._id": actId } });
  }

  pipeline.push(
    { $unwind: "$activities.dependency" },
    { $match: { "activities.dependency._id": depId } },
    { $limit: 1 },
    { $project: { dep: "$activities.dependency", _id: 0 } }
  );

  const out = await Model.aggregate(pipeline);
  return out?.[0]?.dep || null;
}

async function resolveRefDisplay(modelName, id) {
  const oid = toObjectId(id);
  if (!modelExists(modelName) || !oid) return null;
  const M = mongoose.model(modelName);
  const doc = await M.findById(oid)
    .select("name code approval_code title")
    .lean();
  return (
    doc?.name || doc?.code || doc?.approval_code || doc?.title || String(oid)
  );
}

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

    // ---------- ROLE / DEPT SCOPING ----------
    const user = await User.findById(req.user.userId);
    const userId = user?._id;
    const department = user?.department;
    const role = user?.role;
    const name = user?.name;

    const isPrivileged =
      (department &&
        ["admin", "superadmin"].includes(department.toLowerCase())) ||
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

    const baseQuery = andFilters.length ? { $and: andFilters } : {};

    // ---------- SEARCH: ONLY approval_code (or code) + project code ----------
    let requests = [];
    let total = 0;

    if (search && search.trim()) {
      const term = search.trim();
      const rx = new RegExp(escapeRegex(term), "i");

      // A) approval_code / code
      const idsByApproval = await Approval.find(
        { ...baseQuery, $or: [{ approval_code: rx }, { code: rx }] },
        { _id: 1, createdAt: 1 }
      )
        .sort({ createdAt: -1 })
        .lean();

      // B) project code via model_id.project_id
      const projectsByCode = await Project.find(
        { code: rx },
        { _id: 1 }
      ).lean();
      let idsByProject = [];
      if (projectsByCode.length) {
        const projectIds = projectsByCode.map((p) => p._id);

        const raw = await Approval.find(baseQuery)
          .populate({
            path: "model_id",
            select: "project_id",
            match: { project_id: { $in: projectIds } },
          })
          .sort({ createdAt: -1 })
          .select("_id createdAt")
          .lean();

        idsByProject = raw.filter((r) => r.model_id);
      }

      // UNION + date sort
      const mergedMap = new Map();
      for (const r of [...idsByApproval, ...idsByProject]) {
        const id = String(r._id);
        const ts =
          r.createdAt instanceof Date
            ? r.createdAt.getTime()
            : new Date(r.createdAt).getTime();
        if (!mergedMap.has(id) || mergedMap.get(id) < ts) mergedMap.set(id, ts);
      }

      const orderedIds = Array.from(mergedMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);

      total = orderedIds.length;

      const start = (pageNum - 1) * limitNum;
      const end = start + limitNum;
      const pageIds = orderedIds
        .slice(start, end)
        .map((s) => new mongoose.Types.ObjectId(s));

      const pageDocs = await Approval.find({ _id: { $in: pageIds } })
        .populate("created_by", "_id name attachment_url")
        .populate("approvers.user_id", "_id name attachment_url")
        .populate("current_approver.user_id", "_id name attachment_url")
        .populate("model_id", "project_id") // note: populated doc has _id
        .lean();

      const order = new Map(pageIds.map((id, i) => [String(id), i]));
      requests = pageDocs.sort(
        (a, b) =>
          (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0)
      );
    } else {
      [requests, total] = await Promise.all([
        Approval.find(baseQuery)
          .populate("created_by", "_id name attachment_url")
          .populate("approvers.user_id", "_id name attachment_url")
          .populate("current_approver.user_id", "_id name attachment_url")
          .populate("model_id", "project_id")
          .sort({ createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
        Approval.countDocuments(baseQuery),
      ]);
    }

    // ---------- PROJECT LOOKUP FOR DISPLAY ----------
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
        {
          _id: {
            $in: Array.from(projectIdSet).map(
              (id) => new mongoose.Types.ObjectId(id)
            ),
          },
        },
        { _id: 1, code: 1, name: 1 }
      ).lean();

      projectMap = new Map(projects.map((p) => [String(p._id), p]));
    }

    const requestsWithProject = requests.map((r) => {
      const pid = r?.model_id?.project_id
        ? String(r.model_id.project_id)
        : null;
      const proj = pid ? projectMap.get(pid) : null;

      return {
        ...r,
        project: proj
          ? { _id: proj._id, code: proj.code, name: proj.name }
          : null,
      };
    });

    const enriched = await Promise.all(
      requestsWithProject.map(async (r) => {
        const modelName = r?.model_name;
        const modelId = toObjectId(r?.model_id);
        const depId = toObjectId(r?.dependency_id);
        const actId = toObjectId(r?.activity_id);

        if (!modelName || !modelId || !depId) return r;

        const dep = await fetchDependencyRefById(
          modelName,
          modelId,
          depId,
          actId
        );
        if (!dep || !dep.model || !dep.model_id) return r;

        const dependency_name = await resolveRefDisplay(
          dep.model,
          dep.model_id
        );

        return {
          ...r,
          dependency_name,
          dependency_model: dep.model,
          dependency_model_id: dep.model_id,
        };
      })
    );

    return res.status(200).json({
      page: pageNum,
      limit: limitNum,
      total,
      requests: enriched,
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

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
    const userId = toObjectId(req.user.userId);

    // ---------- BASE FILTERS (ONLY approvals where the user is an approver) ----------
    const andFilters = [{ "approvers.user_id": userId }];

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

    const baseQuery = andFilters.length ? { $and: andFilters } : {};

    // ---------- SEARCH: ONLY approval_code (or code) + project code ----------
    let reviews = [];
    let total = 0;

    if (search && search.trim()) {
      const term = search.trim();
      const rx = new RegExp(escapeRegex(term), "i");

      // A) approvals matching approval_code / code where user is an approver
      const idsByApproval = await Approval.find(
        { ...baseQuery, $or: [{ approval_code: rx }, { code: rx }] },
        { _id: 1, createdAt: 1 }
      )
        .sort({ createdAt: -1 })
        .lean();

      // B) approvals whose project code matches `search` (via model_id.project_id)
      const projectsByCode = await Project.find(
        { code: rx },
        { _id: 1 }
      ).lean();
      let idsByProject = [];
      if (projectsByCode.length) {
        const projectIds = projectsByCode.map((p) => p._id);

        const raw = await Approval.find(baseQuery)
          .populate({
            path: "model_id",
            select: "project_id",
            match: { project_id: { $in: projectIds } },
          })
          .sort({ createdAt: -1 })
          .select("_id createdAt")
          .lean();

        idsByProject = raw.filter((r) => r.model_id);
      }

      // UNION + sort by createdAt desc
      const mergedMap = new Map();
      for (const r of [...idsByApproval, ...idsByProject]) {
        const id = String(r._id);
        const ts =
          r.createdAt instanceof Date
            ? r.createdAt.getTime()
            : new Date(r.createdAt).getTime();
        if (!mergedMap.has(id) || mergedMap.get(id) < ts) mergedMap.set(id, ts);
      }

      const orderedIds = Array.from(mergedMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);

      total = orderedIds.length;

      const start = (pageNum - 1) * limitNum;
      const end = start + limitNum;
      const pageIds = orderedIds
        .slice(start, end)
        .map((s) => new mongoose.Types.ObjectId(s));

      // fetch full docs for page, then restore order
      const pageDocs = await Approval.find({ _id: { $in: pageIds } })
        .populate("created_by", "_id name attachment_url")
        .populate("approvers.user_id", "_id name attachment_url")
        .populate("current_approver.user_id", "_id name attachment_url")
        .populate("model_id", "project_id")
        .lean();

      const order = new Map(pageIds.map((id, i) => [String(id), i]));
      reviews = pageDocs.sort(
        (a, b) =>
          (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0)
      );
    } else {
      // No search: regular paged query (still only approvals where user is approver)
      [reviews, total] = await Promise.all([
        Approval.find(baseQuery)
          .populate("created_by", "_id name attachment_url")
          .populate("approvers.user_id", "_id name attachment_url")
          .populate("current_approver.user_id", "_id name attachment_url")
          .populate("model_id", "project_id")
          .sort({ createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
        Approval.countDocuments(baseQuery),
      ]);
    }

    // ---------- PROJECT LOOKUP FOR DISPLAY ----------
    const projectIdSet = new Set();
    for (const r of reviews) {
      const maybeId = r?.model_id?.project_id;
      if (maybeId && mongoose.Types.ObjectId.isValid(String(maybeId))) {
        projectIdSet.add(String(maybeId));
      }
    }

    let projectMap = new Map();
    if (projectIdSet.size) {
      const projects = await Project.find(
        {
          _id: {
            $in: Array.from(projectIdSet).map(
              (id) => new mongoose.Types.ObjectId(id)
            ),
          },
        },
        { _id: 1, code: 1, name: 1 }
      ).lean();

      projectMap = new Map(projects.map((p) => [String(p._id), p]));
    }

    const reviewsWithProject = reviews.map((r) => {
      const pid = r?.model_id?.project_id
        ? String(r.model_id.project_id)
        : null;
      const proj = pid ? projectMap.get(pid) : null;

      return {
        ...r,
        project: proj
          ? { _id: proj._id, code: proj.code, name: proj.name }
          : null,
      };
    });

    // ---------- OPTIONAL: Enrich dependency_name ----------
    const enriched = await Promise.all(
      reviewsWithProject.map(async (r) => {
        const modelName = r?.model_name;
        const modelId = toObjectId(r?.model_id);
        const depId = toObjectId(r?.dependency_id);
        const actId = toObjectId(r?.activity_id);

        if (!modelName || !modelId || !depId) return r;

        const dep = await fetchDependencyRefById(
          modelName,
          modelId,
          depId,
          actId
        );
        if (!dep || !dep.model || !dep.model_id) return r;

        const dependency_name = await resolveRefDisplay(
          dep.model,
          dep.model_id
        );

        return {
          ...r,
          dependency_name,
          dependency_model: dep.model,
          dependency_model_id: dep.model_id,
        };
      })
    );

    return res.status(200).json({
      page: pageNum,
      limit: limitNum,
      total,
      reviews: enriched,
    });
  } catch (error) {
    return res.status(500).json({
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
