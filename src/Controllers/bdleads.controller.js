const userModells = require("../models/user.model");
const mongoose = require("mongoose");
const { Parser } = require("json2csv");
const bdleadsModells = require("../models/bdleads.model");
const axios = require("axios");
const FormData = require("form-data");
const { shouldUpdateStatus } = require("../utils/shouldUpdateStatus");
const group = require("../models/bdgroup.model");
const task = require("../models/bdtask.model");
const groupModells = require("../models/bdgroup.model");
const { Novu } = require("@novu/node");
const { getnovuNotification } = require("../utils/nouvnotification.utils");
const handoversheetModells = require("../models/handoversheet.model");
const userModel = require("../models/user.model");

const createBDlead = async function (req, res) {
  try {
    const novu = new Novu(process.env.NOVU_SECRET_KEY);
    const body = req.body;
    const requiredFields = [
      "name",
      "contact_details.mobile",
      "address.village",
      "address.district",
      "address.state",
      "project_details.capacity",
      "source.from",
      "source.sub_source",
      "comments",
    ];

    const isMissing = requiredFields.some((path) => {
      const keys = path.split(".");
      let current = body;
      for (const key of keys) {
        current = current?.[key];
        if (!current) return true;
      }
      return false;
    });

    if (isMissing) {
      return res
        .status(400)
        .json({ error: "Please fill all required fields." });
    }

    const user_id = req.user.userId;
    const groupId = body.group_id;
    const currentCapacity = parseFloat(body?.project_details?.capacity || 0);

    if (groupId) {
      const groupData = await group.findById(groupId);
      if (!groupData) {
        return res.status(404).json({ error: "Group not found." });
      }

      const leadsInGroup = await bdleadsModells.find({ group_id: groupId });
      const totalExistingCapacity = leadsInGroup.reduce(
        (acc, lead) => acc + (parseFloat(lead?.project_details?.capacity) || 0),
        0
      );

      const totalAfterAdding = totalExistingCapacity + currentCapacity;
      if (totalAfterAdding > groupData?.project_details?.capacity) {
        return res.status(400).json({
          error: `Total capacity (${totalAfterAdding} MW) exceeds group limit (${groupData.project_details?.capacity} MW).`,
        });
      }
    } else {
      const mobiles = (body?.contact_details?.mobile || []).map((m) =>
        m.trim()
      );

      const existingLead = await bdleadsModells.aggregate([
        {
          $match: {
            $expr: {
              $gt: [
                {
                  $size: {
                    $setIntersection: [
                      mobiles,
                      {
                        $map: {
                          input: { $ifNull: ["$contact_details.mobile", []] },
                          as: "m",
                          in: { $trim: { input: "$$m" } },
                        },
                      },
                    ],
                  },
                },
                0,
              ],
            },
          },
        },
        { $limit: 1 },
      ]);

      if (existingLead.length > 0) {
        return res.status(400).json({
          error: "Lead already exists with the provided mobile number!!",
        });
      }
    }

    const lastLead = await bdleadsModells.aggregate([
      { $match: { id: { $regex: /^BD\/Lead\// } } },
      {
        $addFields: {
          numericId: {
            $toInt: { $arrayElemAt: [{ $split: ["$id", "/"] }, -1] },
          },
        },
      },
      { $sort: { numericId: -1 } },
      { $limit: 1 },
    ]);

    const lastNumber = lastLead?.[0]?.numericId || 0;
    const nextId = `BD/Lead/${lastNumber + 1}`;

    const payload = {
      ...body,
      id: nextId,
      submitted_by: user_id,
      assigned_to: [
        {
          user_id: user_id,
          status: "",
        },
      ],
    };

    const bdLead = new bdleadsModells(payload);

    await bdLead.save();

    res.status(200).json({
      message: "BD Lead created successfully",
      data: bdLead,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Something went wrong" });
  }
};

const getAllLeads = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      fromDate,
      toDate,
      stage,
      lead_without_task,
      handover_statusFilter,
      name,
      stateFilter,
      group_id,
      inactiveFilter,
      leadAgingFilter,
      ClosingDateFilter,
      priorityFilter,
    } = req.query;
    const userId = req.user.userId;
    const user = await userModells.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPrivilegedUser =
      ["admin", "superadmin"].includes(user.department) ||
      ["Prachi Singh"].includes(user.name) ||
      (user.department === "BD" && user.role === "manager");

    const query = {};

    const regionalAccessMap = {
      "Shambhavi Gupta": ["rajasthan", "telangana"],
      "Vibhav Upadhyay": ["rajasthan", "uttar pradesh"],
      "Navin Kumar Gautam": ["rajasthan"],
      "Ketan Kumar Jha": ["madhya pradesh"],
      "Gaurav Kumar Upadhyay": ["madhya pradesh"],
      "Om Utkarsh": ["rajasthan"],
      "Abhishek Sawhney": ["chhattisgarh"],
      "Sankalp Choudhary": ["chhattisgarh"],
      "Kunal Kumar": ["rajasthan"],
    };

    if (!isPrivilegedUser && !regionalAccessMap[user.name]) {
      query["current_assigned.user_id"] = new mongoose.Types.ObjectId(userId);
    }

    if (regionalAccessMap[user.name] && !isPrivilegedUser) {
      const regions = regionalAccessMap[user.name];
      query.$or = [
        { "current_assigned.user_id": new mongoose.Types.ObjectId(userId) },
        {
          "address.state": {
            $in: regions.map((r) => new RegExp(`^${r}$`, "i")),
          },
        },
      ];
    }

    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [
        { name: regex },
        { "contact_details.mobile": regex },
        { "project_details.scheme": regex },
        { id: regex },
        { "current_status.name": regex },
        { group_name: regex },
        { group_code: regex },
      ];
    }

    if (stateFilter) {
      const states = decodeURIComponent(stateFilter)
        .split(",")
        .map((s) => s.trim().toLowerCase());
      query["address.state"] = {
        $in: states.map((s) => new RegExp(`^${s}$`, "i")),
      };
    }

    if (group_id) {
      query.group_id = group_id;
    }

    if (fromDate && toDate) {
      const start = new Date(fromDate);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }

    if (stage && stage !== "lead_without_task") {
      query["current_status.name"] = stage;
    }

    if (handover_statusFilter === "pending") {
      query["status_of_handoversheet"] = { $in: [null, false, ""] };
      query["current_status.name"] = "won";
    }

    if (priorityFilter) {
      const priorities = priorityFilter
        .split(",")
        .map((p) => p.trim().toLowerCase());
      query.priority = { $in: priorities };
    }

    if (handover_statusFilter === "inprocess") {
      query["status_of_handoversheet"] = { $in: ["draft", "Rejected"] };
      query["current_status.name"] = "won";
    }

    if (handover_statusFilter === "completed") {
      query["status_of_handoversheet"] = { $in: ["submitted", "Approved"] };
      query["current_status.name"] = "won";
    }

    if (inactiveFilter) {
      const cutoffDate = new Date(
        Date.now() - Number(inactiveFilter) * 24 * 60 * 60 * 1000
      );
      query.inactivedate = { $gte: cutoffDate };
    }

    if (leadAgingFilter) {
      query.leadAging = { $lte: Number(leadAgingFilter) };
    }

    if (ClosingDateFilter && ClosingDateFilter.length > 0) {
      const year = new Date().getFullYear();

      const months = ClosingDateFilter.split(",").map((m) => Number(m));

      const monthQueries = months.map((month) => {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);
        end.setHours(23, 59, 59, 999);

        return { expected_closing_date: { $gte: start, $lte: end } };
      });

      query.$or = monthQueries;
    }

    if (name) {
      const userObjectId = new mongoose.Types.ObjectId(name);
      query["current_assigned.user_id"] = userObjectId;
    }

    if (lead_without_task === "true") {
      const leadsWithTasks = await task.distinct("lead_id", {
        current_status: { $ne: "completed" },
      });
      query._id = { $nin: leadsWithTasks };
      query["current_status.name"] = { $ne: "won" };
    }

    const total = await bdleadsModells.countDocuments(query);

    const leads = await bdleadsModells
      .find(query)
      .populate("current_assigned.user_id", "_id name")
      .populate("submitted_by", "_id name")
      .populate("group_id", "_id group_name group_code")
      .populate("status_history.user_id", "_id name")
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    return res.status(200).json({
      message: "BD Leads fetched successfully",
      total,
      page: +page,
      limit: +limit,
      leads,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

const getLeadCounts = async (req, res) => {
  try {
    const {
      search = "",
      fromDate,
      toDate,
      handover_statusFilter,
      name,
      stateFilter,
      group_id,
      inactiveFilter,
      leadAgingFilter,
      ClosingDateFilter,
      priorityFilter,
    } = req.query;

    const userId = req.user.userId;
    const user = await userModells.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const andConditions = [];

    const isPrivilegedUser =
      ["admin", "superadmin"].includes(user.department) ||
      ["Prachi Singh"].includes(user.name) ||
      (user.department === "BD" && user.role === "manager");

    const regionalAccessMap = {
      "Shambhavi Gupta": ["rajasthan", "telangana"],
      "Vibhav Upadhyay": ["rajasthan", "uttar pradesh"],
      "Navin Kumar Gautam": ["rajasthan"],
      "Ketan Kumar Jha": ["madhya pradesh"],
      "Gaurav Kumar Upadhyay": ["madhya pradesh"],
      "Om Utkarsh": ["rajasthan"],
      "Abhishek Sawhney": ["chhattisgarh"],
      "Sankalp Choudhary": ["chhattisgarh"],
      "Kunal Kumar": ["rajasthan"],
    };

    if (!isPrivilegedUser && !regionalAccessMap[user.name]) {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      andConditions.push({
        "current_assigned.user_id": userObjectId,
      });
    }

    if (!isPrivilegedUser && regionalAccessMap[user.name]) {
      const regions = regionalAccessMap[user.name];
      andConditions.push({
        $or: [
          {
            "address.state": {
              $in: regions.map((r) => new RegExp(`^${r.trim()}$`, "i")),
            },
          },
          { "current_assigned.user_id": new mongoose.Types.ObjectId(userId) },
        ],
      });
    }

    if (search) {
      const regex = new RegExp(search, "i");
      andConditions.push({
        $or: [
          { name: regex },
          { "contact_details.mobile": regex },
          { "project_details.scheme": regex },
          { id: regex },
          { "current_status.name": regex },
          { group_name: regex },
          { group_code: regex },
        ],
      });
    }

    if (stateFilter) {
      const states = decodeURIComponent(stateFilter)
        .split(",")
        .map((s) => s.trim().toLowerCase());
      andConditions.push({
        "address.state": { $in: states.map((s) => new RegExp(`^${s}$`, "i")) },
      });
    }

    if (group_id) andConditions.push({ group_id });

    if (fromDate && toDate) {
      const start = new Date(fromDate);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      andConditions.push({ createdAt: { $gte: start, $lte: end } });
    }

    if (handover_statusFilter === "pending") {
      andConditions.push({
        $or: [
          { status_of_handoversheet: { $in: [null, false, ""] } },
          { status_of_handoversheet: { $exists: false } },
        ],
      });
      andConditions.push({ "current_status.name": "won" });
    }

    if (handover_statusFilter === "inprocess") {
      andConditions.push({
        status_of_handoversheet: { $in: ["draft", "Rejected"] },
      });
      andConditions.push({ "current_status.name": "won" });
    }

    if (priorityFilter) {
      const priorities = priorityFilter
        .split(",")
        .map((p) => p.trim().toLowerCase());
      andConditions.push({ priority: { $in: priorities } });
    }

    if (handover_statusFilter === "completed") {
      andConditions.push({
        status_of_handoversheet: { $in: ["submitted", "Approved"] },
      });
      andConditions.push({ "current_status.name": "won" });
    }

    if (inactiveFilter) {
      const cutoffDate = new Date(
        Date.now() - Number(inactiveFilter) * 24 * 60 * 60 * 1000
      );
      andConditions.push({ inactivedate: { $gte: cutoffDate } });
    }

    if (leadAgingFilter) {
      andConditions.push({ leadAging: { $lte: Number(leadAgingFilter) } });
    }

    if (ClosingDateFilter && ClosingDateFilter.length > 0) {
      const year = new Date().getFullYear();

      const months = ClosingDateFilter.split(",").map((m) => Number(m));

      const monthQueries = months.map((month) => {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);
        end.setHours(23, 59, 59, 999);

        return { expected_closing_date: { $gte: start, $lte: end } };
      });

      andConditions.push({ $or: monthQueries });
    }

    if (name) {
      const userObjectId = new mongoose.Types.ObjectId(name);
      andConditions.push({
        "current_assigned.user_id": userObjectId,
      });
    }

    const baseQuery = andConditions.length > 0 ? { $and: andConditions } : {};

    const stageCountsAgg = await bdleadsModells.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: { $toLower: "$current_status.name" },
          count: { $sum: 1 },
        },
      },
    ]);

    const stageNames = ["initial", "follow up", "warm", "won", "dead"];
    const stageCounts = stageNames.reduce((acc, s) => {
      const found = stageCountsAgg.find(
        (x) => x._id && x._id.toLowerCase() === s.toLowerCase()
      );
      acc[s] = found?.count || 0;
      return acc;
    }, {});

    stageCounts.all = await bdleadsModells.countDocuments(baseQuery);

    return res.status(200).json({
      message: "Stage counts fetched successfully",
      stageCounts,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

const editLead = async (req, res) => {
  try {
    const { _id } = req.params;
    const { lead_model } = req.query;
    const updatedData = req.body;

    if (!lead_model) {
      return res.status(400).json({ message: "Lead model is required" });
    }

    let Model;
    switch (lead_model) {
      case "initial":
        Model = initiallead;
        break;
      case "followup":
        Model = followUpBdleadModells;
        break;
      case "warm":
        Model = warmbdLeadModells;
        break;
      case "won":
        Model = wonleadModells;
        break;
      case "dead":
        Model = deadleadModells;
        break;
      default:
        return res.status(400).json({ message: "Invalid lead model" });
    }

    const updatedLead = await Model.findByIdAndUpdate(_id, updatedData, {
      new: true,
    });

    if (!updatedLead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    res
      .status(200)
      .json({ message: "Lead updated successfully", data: updatedLead });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating lead", error: error.message });
  }
};

const deleteLead = async (req, res) => {
  try {
    const { _id } = req.params;

    if (!_id) {
      return res.status(400).json({ message: "Lead ID is required" });
    }

    const deletedLead = await bdleadsModells.findByIdAndDelete(_id);

    if (!deletedLead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const userId = req.user.userId;
    const user = await userModells.findById(userId);

    res
      .status(200)
      .json({ message: "Lead deleted successfully", data: deletedLead });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting lead", error: error.message });
  }
};

const updateAssignedTo = async (req, res) => {
  try {
    const { leadIds, assigned } = req.body;

    if (!Array.isArray(leadIds) || leadIds.length === 0 || !assigned) {
      return res.status(400).json({
        success: false,
        message: "leadIds must be a non-empty array and assigned is required",
      });
    }

    const sendBy_id = req.user.userId;
    const sendBy_Name = await userModel.findById(sendBy_id).select("name");
    const user = await userModells.findById(assigned);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Assigned user not found",
      });
    }

    const updatedLeads = [];

    for (const leadId of leadIds) {
      const lead = await bdleadsModells.findById(leadId);
      if (!lead) continue;
      const status = lead.current_status?.name || "";
      lead.assigned_to.push({
        user_id: user._id,
        status,
      });

      await lead.save();
      updatedLeads.push(lead);
    }

    // Notification Functionality for Transfer Lead

    const Ids = leadIds.map((id) => new mongoose.Types.ObjectId(id));

    const leads = await bdleadsModells.find({ _id: { $in: Ids } }).select("id");

    const assign = await userModells.findById(assigned).select("name");

    try {
      for (const lead of leads) {
        const workflow = "lead";
        const alluser = await userModells
          .find({
            $or: [
              { department: "admin" },
              { department: "BD", role: "manager" },
            ],
          })
          .select("_id")
          .lean()
          .then((users) => users.map((u) => u._id));

        const senders = [...new Set([...alluser, assigned])];
        const data = {
          Module: "Lead Transfer",
          sendBy_Name: sendBy_Name.name,
          message: `Lead ${lead.id} transferred to ${assign.name}`,
          link: `leadProfile?id=${lead._id}`,
          type: "sales",
          link1: `/sales`,
        };

        setImmediate(() => {
          getnovuNotification(workflow, senders, data).catch((err) =>
            console.error("Notification error:", err)
          );
        });
      }
    } catch (error) {
      console.log(error);
    }

    return res.status(200).json({
      success: true,
      message: "User assigned to leads successfully",
      data: updatedLeads,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

const attachToGroup = async (req, res) => {
  try {
    const { leadIds, groupId } = req.body;

    if (!Array.isArray(leadIds) || leadIds.length === 0 || !groupId) {
      return res.status(400).json({
        success: false,
        message: "leadIds must be a non-empty array and group is required",
      });
    }

    const group = await groupModells.findById(groupId);

    const alreadyAttachedLeads = await bdleadsModells.find({
      group_id: groupId,
    });

    const existingCapacity = alreadyAttachedLeads.reduce((sum, lead) => {
      return sum + (Number(lead.project_details.capacity) || 0);
    }, 0);

    const newLeads = await bdleadsModells.find({ _id: { $in: leadIds } });

    const alreadyGroupedLead = newLeads.find((lead) => lead.group_id);
    if (alreadyGroupedLead) {
      return res.status(400).json({
        success: false,
        message: `Lead with ID ${alreadyGroupedLead.id} is already attached to a group`,
      });
    }

    const newCapacity = newLeads.reduce((sum, lead) => {
      return sum + (Number(lead.project_details.capacity) || 0);
    }, 0);

    const totalCapacity = existingCapacity + newCapacity;

    if (totalCapacity > group.project_details.capacity) {
      return res.status(400).json({
        success: false,
        message: `Cannot attach leads. Total capacity (${totalCapacity}) exceeds group capacity (${group.project_details.capacity})`,
      });
    }

    const updatedLeads = [];

    for (const lead of newLeads) {
      lead.group_id = groupId;
      await lead.save();
      updatedLeads.push(lead);
    }

    return res.status(200).json({
      success: true,
      message: "Leads successfully attached to the group",
      data: updatedLeads,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

const exportLeadsCSV = async (req, res) => {
  try {
    const { Ids = [] } = req.body;

    const leads = await bdleadsModells.aggregate([
      {
        $match: {
          _id: { $in: Ids.map((id) => new mongoose.Types.ObjectId(id)) },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "assigned_to.user_id",
          foreignField: "_id",
          as: "assigned_users",
        },
      },
      {
        $addFields: {
          assigned_user: { $arrayElemAt: ["$assigned_users", 0] },
        },
      },
    ]);

    const mapped = leads.map((item) => ({
      Status: item.current_status?.name || "",
      "Lead Id": item.id,
      Name: item.name || "",
      Mobile: item.contact_details?.mobile?.[0] || "",
      State: item.address?.state || "",
      Scheme: item.project_details?.scheme || "",
      "Capacity (MW)": item.project_details?.capacity || "",
      "Distance (KM)":
        item.project_details?.distance_from_substation?.value || "",
      Date: new Date(item.createdAt).toLocaleDateString(),
      "Lead Owner": item.assigned_user?.name || "",
    }));

    const fields = [
      { label: "Status", value: "Status" },
      { label: "Lead Id", value: "Lead Id" },
      { label: "Name", value: "Name" },
      { label: "Mobile", value: "Mobile" },
      { label: "State", value: "State" },
      { label: "Scheme", value: "Scheme" },
      { label: "Capacity (MW)", value: "Capacity (MW)" },
      { label: "Distance (KM)", value: "Distance (KM)" },
      { label: "Date", value: "Date" },
      { label: "Lead Owner", value: "Lead Owner" },
    ];

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(mapped);

    res.header("Content-Type", "text/csv");
    res.attachment("leads.csv");
    return res.send(csv);
  } catch (err) {
    console.error("CSV Export Error:", err);
    res.status(500).json({ message: "CSV export failed", error: err.message });
  }
};

// Get Lead by LeadId or id
const getLeadByLeadIdorId = async (req, res) => {
  try {
    const { leadId, id } = req.query;

    if (!id && !leadId) {
      return res.status(400).json({ message: "Lead Id or id is required" });
    }

    const matchQuery = {};
    if (id) matchQuery._id = new mongoose.Types.ObjectId(id);
    if (leadId) matchQuery.id = leadId;

    const data = await bdleadsModells.aggregate([
      { $match: matchQuery },

      // Normalize missing arrays to avoid errors
      {
        $addFields: {
          status_history: { $ifNull: ["$status_history", []] },
          assigned_to: { $ifNull: ["$assigned_to", []] },
          documents: { $ifNull: ["$documents", []] },
        },
      },

      // submitted_by
      {
        $lookup: {
          from: "users",
          localField: "submitted_by",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, name: 1 } }],
          as: "submitted_by_user",
        },
      },
      {
        $addFields: {
          submitted_by: { $arrayElemAt: ["$submitted_by_user", 0] },
        },
      },
      { $project: { submitted_by_user: 0 } },

      // assigned_to.user_id
      {
        $lookup: {
          from: "users",
          let: { assignedUsers: "$assigned_to.user_id" },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$assignedUsers"] } } },
            { $project: { _id: 1, name: 1 } },
          ],
          as: "assigned_users",
        },
      },
      {
        $addFields: {
          assigned_to: {
            $map: {
              input: "$assigned_to",
              as: "a",
              in: {
                _id: "$$a._id",
                status: "$$a.status",
                user_id: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$assigned_users",
                        as: "u",
                        cond: { $eq: ["$$u._id", "$$a.user_id"] },
                      },
                    },
                    0,
                  ],
                },
              },
            },
          },
        },
      },
      { $project: { assigned_users: 0 } },

      // status_history.user_id
      {
        $lookup: {
          from: "users",
          let: { statusUserIds: "$status_history.user_id" },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$statusUserIds"] } } },
            { $project: { _id: 1, name: 1 } },
          ],
          as: "status_users",
        },
      },
      {
        $addFields: {
          status_history: {
            $map: {
              input: "$status_history",
              as: "s",
              in: {
                $mergeObjects: [
                  "$$s",
                  {
                    user_id: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$status_users",
                            as: "u",
                            cond: { $eq: ["$$u._id", "$$s.user_id"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      { $project: { status_users: 0 } },

      // current_assigned.user_id
      {
        $lookup: {
          from: "users",
          localField: "current_assigned.user_id",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, name: 1 } }],
          as: "current_assigned_user",
        },
      },
      {
        $addFields: {
          current_assigned: {
            $mergeObjects: [
              "$current_assigned",
              {
                user_id: { $arrayElemAt: ["$current_assigned_user", 0] },
              },
            ],
          },
        },
      },
      { $project: { current_assigned_user: 0 } },

      // group info
      {
        $lookup: {
          from: "groups",
          localField: "group_id",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, group_code: 1, group_name: 1 } }],
          as: "group_info",
        },
      },
      {
        $addFields: {
          group_code: {
            $cond: {
              if: { $gt: [{ $size: "$group_info" }, 0] },
              then: { $arrayElemAt: ["$group_info.group_code", 0] },
              else: null,
            },
          },
          group_name: {
            $cond: {
              if: { $gt: [{ $size: "$group_info" }, 0] },
              then: { $arrayElemAt: ["$group_info.group_name", 0] },
              else: null,
            },
          },
        },
      },
      { $project: { group_info: 0 } },

      // Backup docs
      {
        $addFields: {
          documentsBackup: "$documents",
        },
      },

      // populate documents.user_id
      { $unwind: { path: "$documents", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "documents.user_id",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, name: 1 } }],
          as: "document_user",
        },
      },
      {
        $addFields: {
          "documents.user_id": { $arrayElemAt: ["$document_user", 0] },
        },
      },
      { $project: { document_user: 0 } },

      // group docs back, remove empty ones
      {
        $group: {
          _id: "$_id",
          doc: { $first: "$$ROOT" },
          documents: {
            $push: {
              $cond: [{ $ne: ["$documents", {}] }, "$documents", "$$REMOVE"],
            },
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: ["$doc", { documents: "$documents" }],
          },
        },
      },

      // fallback to empty if [{}]
      {
        $addFields: {
          documents: {
            $cond: {
              if: {
                $and: [
                  { $isArray: "$documents" },
                  { $eq: [{ $size: "$documents" }, 1] },
                  { $eq: ["$documents.0", {}] },
                ],
              },
              then: [],
              else: "$documents",
            },
          },
        },
      },
      { $project: { documentsBackup: 0 } },
    ]);

    if (!data.length) {
      return res.status(404).json({ message: "Lead not found" });
    }

    res.status(200).json({
      message: "Lead Information retrieved successfully",
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateLeadStatus = async function (req, res) {
  try {
    const leads = await bdleadsModells.findById(req.params._id);

    if (!leads) return res.status(404).json({ error: "Lead not found" });
    const user_id = req.user.userId;

    leads.status_history.push({
      ...req.body,
      user_id: user_id,
    });

    if (
      leads.expected_closing_date === undefined ||
      leads.expected_closing_date === null
    ) {
      leads.expected_closing_date = req.body.expected_closing_date;
    }

    await leads.save();
    res.status(200).json(leads);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const updateLeadStatusBulk = async function (req, res) {
  try {
    const { ids, name, stage, remarks, expected_closing_date } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No lead IDs provided" });
    }

    const user_id = req.user.userId;

    const results = await Promise.all(
      ids.map(async (id) => {
        const lead = await bdleadsModells.findById(id);
        if (!lead) return null;

        lead.status_history.push({
          name,
          stage,
          remarks,
          user_id,
          updatedAt: new Date(),
        });

        await lead.save();
        return lead;
      })
    );

    const updatedLeads = results.filter((lead) => lead !== null);

    return res.status(200).json({
      message: "Leads updated successfully",
      updatedLeads,
      notFound: ids.filter((id, i) => results[i] === null),
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

const getAllLeadDropdown = async (req, res) => {
  try {
    const leads = await bdleadsModells.find(
      {},
      "id _id name contact_details.email contact_details.mobile"
    );

    res.status(200).json({
      message: "All BD Leads",
      leads,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

const uploadDocuments = async (req, res) => {
  try {
    const data =
      typeof req.body.data === "string"
        ? JSON.parse(req.body.data)
        : req.body.data;

    const { lead_id, name, stage, remarks, expected_closing_date } = data;
    const user_id = req.user.userId;

    if (!lead_id || !name) {
      return res
        .status(400)
        .json({ message: "lead_id, name, and user_id are required" });
    }

    const lead = await bdleadsModells.findById(lead_id);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const folderPath = `Sales/${lead.id.replace(/\//g, "_")}/${name.replace(/ /g, "_")}/${stage.replace(/ /g, "_")}`;
    const uploadedFileMap = {};

    for (const file of req.files || []) {
      const match = file.fieldname.match(/file_(\d+)/);
      if (!match) continue;

      const index = match[1];

      const form = new FormData();
      form.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${folderPath}`;

      const response = await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const respData = response.data;
      const url =
        Array.isArray(respData) && respData.length > 0
          ? respData[0]
          : respData.url ||
            respData.fileUrl ||
            (respData.data && respData.data.url) ||
            null;

      if (url) {
        uploadedFileMap[index] = url;
      } else {
        console.warn(`No URL found for uploaded file ${file.originalname}`);
      }
    }

    // Add uploaded document to lead.documents
    Object.values(uploadedFileMap).forEach((url) => {
      lead.documents.push({
        name: stage,
        attachment_url: url,
        user_id,
        remarks,
      });
    });

    const currentStatus = lead.current_status?.name;

    if (
      shouldUpdateStatus(currentStatus, stage) &&
      name !== "aadhaar" &&
      name !== "other" &&
      stage !== "aadhaar" &&
      stage !== "other"
    ) {
      lead.status_history.push({
        name,
        stage,
        remarks: name.toUpperCase(),
        user_id,
      });
    }

    if (
      lead.expected_closing_date === undefined ||
      lead.expected_closing_date === null
    ) {
      lead.expected_closing_date = expected_closing_date;
    }

    await lead.save();

    return res.status(200).json({
      message: `${name.toUpperCase()} document uploaded and status updated successfully`,
      data: lead,
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message || error.toString(),
    });
  }
};

const updateExpectedClosing = async (req, res) => {
  try {
    const { _id } = req.params;
    const { date } = req.body;

    const lead = await bdleadsModells.findById(_id);
    lead.expected_closing_date = date;
    await lead.save();
    res.status(200).json({
      message: "Expected Closing Date updated Successfully",
      data: lead,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateAssignedToFromSubmittedBy = async (req, res) => {
  const models = [
    initiallead,
    followUpBdleadModells,
    warmbdLeadModells,
    wonleadModells,
    deadleadModells,
    createbdleads,
  ];

  try {
    for (const model of models) {
      const leads = await model.find({
        submitted_by: { $exists: true },
        assigned_to: { $exists: false },
      });

      for (const lead of leads) {
        const user = await userModells.findOne({
          name: lead.submitted_by.trim(),
        });

        if (user) {
          lead.assigned_to = user._id;
          await lead.save();
        }
      }
    }

    res.status(200).json({
      message: "assigned_to field updated successfully for all leads.",
    });
  } catch (error) {
    console.error("Error updating assigned_to:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getUniqueState = async (req, res) => {
  try {
    const states = await bdleadsModells.distinct("address.state");
    const lowercasedStates = Array.from(
      new Set(states.filter(Boolean).map((state) => state.trim().toLowerCase()))
    );
    res.status(200).json({ success: true, data: lowercasedStates });
  } catch (error) {
    console.error("Error fetching unique states:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const fixBdLeadsFields = async (req, res) => {
  try {
    const leads = await bdleadsModells.find();
    const todayDate = new Date();

    for (const lead of leads) {
      let updatedFields = {};

      const handover = await handoversheetModells.findOne({ id: lead.id });

      if (handover) {
        updatedFields.status_of_handoversheet =
          handover.status_of_handoversheet || "false";
      } else {
        updatedFields.status_of_handoversheet = "false";
      }

      if (lead.current_status?.name === "won") {
        updatedFields.leadAging = 0;
      } else {
        const createdAt = new Date(lead.createdAt);
        const diffTime = todayDate - createdAt;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        updatedFields.leadAging = diffDays;
      }

      const tasks = await task
        .find({ lead_id: lead._id })
        .sort({ updatedAt: -1 })
        .limit(1);
      if (tasks.length > 0) {
        updatedFields.inactivedate = tasks[0].updatedAt;
      } else {
        updatedFields.inactivedate = lead.createdAt;
      }

      await bdleadsModells.updateOne({ id: lead.id }, { $set: updatedFields });
    }

    return res.status(200).json({ message: "All leads updated successfully." });
  } catch (error) {
    console.error("Error updating leads:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const updatePriority = async (req, res) => {
  try {
    const { leadIds, priority } = req.body;
    if (!Array.isArray(leadIds) || leadIds.length === 0 || !priority) {
      return res.status(400).json({
        success: false,
        message: "leadIds must be a non-empty array and priority is required",
      });
    }
    if (
      !["low", "medium", "high", "highest"].includes(priority.toLowerCase())
    ) {
      return res.status(400).json({
        success: false,
        message: "priority must be one of 'low', 'medium','high' or 'highest'",
      });
    }
    const updatedLeads = await bdleadsModells.updateMany(
      { _id: { $in: leadIds } },
      { $set: { priority } },
      { new: true }
    );
    return res.status(200).json({
      success: true,
      message: "Priority updated successfully",
      data: updatedLeads,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server error",
      error: error.message,
    });
  }
};

module.exports = {
  getAllLeads,
  getAllLeadDropdown,
  uploadDocuments,
  createBDlead,
  updateExpectedClosing,
  editLead,
  deleteLead,
  updateAssignedToFromSubmittedBy,
  updateAssignedTo,
  exportLeadsCSV,
  updateLeadStatus,
  getLeadByLeadIdorId,
  getUniqueState,
  attachToGroup,
  fixBdLeadsFields,
  getLeadCounts,
  updateLeadStatusBulk,
  updatePriority,
};
