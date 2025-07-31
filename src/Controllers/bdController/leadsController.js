const userModells = require("../../Modells/users/userModells");
const mongoose = require("mongoose");
const { Parser } = require("json2csv");
const bdleadsModells = require("../../Modells/bdleads/bdleadsModells");
const axios = require("axios");
const FormData = require("form-data");
const { shouldUpdateStatus } = require("../../utils/shouldUpdateStatus");
const group = require("../../Modells/bdleads/group");
const task = require("../../Modells/bdleads/task");
const groupModells = require("../../Modells/bdleads/group");

const createBDlead = async function (req, res) {
  try {
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
    } = req.query;

    const userId = req.user.userId;
    const user = await userModells.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPrivilegedUser =
      ["admin", "superadmin"].includes(user.department) ||
      (user.department === "BD" && user.role === "manager");

    const and = [];

    if (search) {
      and.push({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { "contact_details.mobile": { $regex: search, $options: "i" } },
          { "project_details.scheme": { $regex: search, $options: "i" } },
          { id: { $regex: search, $options: "i" } },
          { "current_status.name": { $regex: search, $options: "i" } },
        ],
      });
    }

    if (stateFilter) {
      const raw = decodeURIComponent(stateFilter);
      const stateList = raw.split(",").map((s) => s.trim());
      and.push({ "address.state": { $in: stateList } });
    }

    if (!isPrivilegedUser) {
      and.push({ "assigned_to.user_id": new mongoose.Types.ObjectId(userId) });
    }

    if (stage && stage !== "lead_without_task") {
      and.push({ "current_status.name": stage });
    }

    if (group_id) {
      and.push({ group_id: new mongoose.Types.ObjectId(group_id) });
    }

    if (fromDate && toDate) {
      const start = new Date(fromDate);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      and.push({ createdAt: { $gte: start, $lte: end } });
    }

    // Handle "lead_without_task"
    if (lead_without_task === "true") {
      const leadsWithTasks = await task.aggregate([
        { $match: { current_status: { $ne: "completed" } } },
        { $group: { _id: "$lead_id" } },
      ]);
      const leadsToExclude = leadsWithTasks.map((doc) => doc._id);
      and.push({
        $and: [
          { _id: { $nin: leadsToExclude } },
          { "current_status.name": { $ne: "won" } },
        ],
      });
    }

    const matchStage = and.length ? { $match: { $and: and } } : null;

    const basePipeline = [
      ...(matchStage ? [matchStage] : []),

      // Handover info
      {
        $lookup: {
          from: "handoversheets",
          let: { leadId: "$id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    { $trim: { input: { $toString: "$id" } } },
                    { $trim: { input: { $toString: "$$leadId" } } },
                  ],
                },
              },
            },
            { $project: { _id: 1, status_of_handoversheet: 1 } },
          ],
          as: "handover_info",
        },
      },
      {
        $addFields: {
          handover_status: {
            $cond: [
              { $gt: [{ $size: "$handover_info" }, 0] },
              {
                $switch: {
                  branches: [
                    {
                      case: {
                        $eq: [
                          {
                            $toLower: {
                              $getField: {
                                field: "status_of_handoversheet",
                                input: { $arrayElemAt: ["$handover_info", 0] },
                              },
                            },
                          },
                          "draft",
                        ],
                      },
                      then: "in process",
                    },
                    {
                      case: {
                        $eq: [
                          {
                            $toLower: {
                              $getField: {
                                field: "status_of_handoversheet",
                                input: { $arrayElemAt: ["$handover_info", 0] },
                              },
                            },
                          },
                          "submitted",
                        ],
                      },
                      then: "completed",
                    },
                    {
                      case: {
                        $eq: [
                          {
                            $toLower: {
                              $getField: {
                                field: "status_of_handoversheet",
                                input: { $arrayElemAt: ["$handover_info", 0] },
                              },
                            },
                          },
                          "Rejected",
                        ],
                      },
                      then: "rejected",
                    },
                  ],
                  default: "unknown",
                },
              },
              "pending",
            ],
          },
        },
      },

      // Task meta
      {
        $lookup: {
          from: "bdtasks",
          let: { leadId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$lead_id", "$$leadId"] } } },
            {
              $group: {
                _id: null,
                lastModifiedTask: { $max: "$updatedAt" },
              },
            },
            { $project: { _id: 0, lastModifiedTask: 1 } },
          ],
          as: "task_meta",
        },
      },
      {
        $addFields: {
          lastModifiedTask: {
            $ifNull: [
              { $arrayElemAt: ["$task_meta.lastModifiedTask", 0] },
              "$createdAt",
            ],
          },
          wonStatusDate: {
            $let: {
              vars: {
                wonEntry: {
                  $first: {
                    $filter: {
                      input: "$status_history",
                      as: "s",
                      cond: { $eq: ["$$s.name", "won"] },
                    },
                  },
                },
              },
              in: "$$wonEntry.updatedAt",
            },
          },
        },
      },
      {
        $addFields: {
          inactiveDays: {
            $divide: [
              { $subtract: ["$$NOW", "$lastModifiedTask"] },
              1000 * 60 * 60 * 24,
            ],
          },
          leadAging: {
            $ceil: {
              $divide: [
                {
                  $subtract: [
                    { $ifNull: ["$wonStatusDate", "$$NOW"] },
                    "$createdAt",
                  ],
                },
                1000 * 60 * 60 * 24,
              ],
            },
          },
        },
      },

      {
        $match: {
          ...(handover_statusFilter && {
            handover_status: handover_statusFilter,
          }),
          ...(inactiveFilter && {
            inactiveDays: { $lte: Number(inactiveFilter) },
          }),
          ...(leadAgingFilter && {
            leadAging: { $lte: Number(leadAgingFilter) },
          }),
        },
      },

      // Lookup for current_assigned user
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
            status: "$current_assigned.status",
            user_id: { $arrayElemAt: ["$current_assigned_user", 0] },
          },
        },
      },
      ...(name
        ? [
            {
              $match: {
                "current_assigned.user_id.name": {
                  $regex: name,
                  $options: "i",
                },
              },
            },
          ]
        : []),
    ];

    const finalPipeline = [
      ...basePipeline,
      {
        $facet: {
          leads: [
            { $sort: { createdAt: -1 } },
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await bdleadsModells.aggregate(finalPipeline);
    const leads = result[0]?.leads || [];
    const total = result[0]?.totalCount?.[0]?.count || 0;

    // Stage counts
    const stageNames = ["initial", "follow up", "warm", "won", "dead"];
    const stageMatch = !isPrivilegedUser
      ? { "assigned_to.user_id": new mongoose.Types.ObjectId(userId) }
      : {};

    const stageCountsAgg = await bdleadsModells.aggregate([
      { $match: stageMatch },
      { $group: { _id: "$current_status.name", count: { $sum: 1 } } },
    ]);

    const stageCounts = stageNames.reduce((acc, s) => {
      acc[s] = stageCountsAgg.find((x) => x._id === s)?.count || 0;
      return acc;
    }, {});

    const totalAgg = await bdleadsModells.aggregate([
      { $match: stageMatch },
      { $count: "count" },
    ]);
    stageCounts.all = totalAgg[0]?.count || 0;

    const leadWithoutTaskAgg = await bdleadsModells.aggregate([
      { $match: stageMatch },
      {
        $lookup: {
          from: "bdtasks",
          localField: "_id",
          foreignField: "lead_id",
          as: "related_tasks",
        },
      },
      {
        $match: {
          related_tasks: { $size: 0 },
          "current_status.name": { $ne: "won" },
        },
      },
      { $count: "count" },
    ]);
    stageCounts.lead_without_task = leadWithoutTaskAgg[0]?.count || 0;

    return res.status(200).json({
      message: "BD Leads fetched successfully",
      total,
      page: +page,
      limit: +limit,
      leads,
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
        },
      },
      {
        $addFields: {
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
};
