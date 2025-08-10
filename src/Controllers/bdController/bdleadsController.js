const initiallead = require("../../Modells/initialBdLeadModells");
const followUpBdleadModells = require("../../Modells/followupbdModells");
const warmbdLeadModells = require("../../Modells/warmbdLeadModells");
const wonleadModells = require("../../Modells/wonleadModells");
const deadleadModells = require("../../Modells/deadleadModells");
const createbdleads = require("../../Modells/createBDleadModells");
const handoversheet = require("../../Modells/handoversheetModells");
const task = require("../../Modells/bdleads/task");
const bdleadsModells = require("../../Modells/bdleads/bdleadsModells");
const userModells = require("../../Modells/users/userModells");
const { default: mongoose } = require("mongoose");

const getLeadSummary = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await userModells.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPrivilegedUser =
      ["admin", "superadmin"].includes(user.department) ||
      ["Prachi Singh"].includes(user.name) ||
      (user.department === "BD" && user.role === "manager");

    const { range, startDate, endDate } = req.query;
    const now = new Date();
    let fromDate, toDate;

    const rangeKeyMap = {
      today: "day",
      "1 week": "week",
      "2 weeks": "2week",
      "1 month": "1month",
      "3 months": "3months",
      "9 months": "9months",
      "1 year": "1year",
    };

    const normalizedRange = rangeKeyMap[(range || "").toLowerCase()] || range;

    switch (normalizedRange) {
      case "day":
        fromDate = new Date(now.setHours(0, 0, 0, 0));
        toDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case "week":
        fromDate = new Date();
        fromDate.setDate(now.getDate() - 7);
        toDate = new Date();
        break;
      case "2week":
        fromDate = new Date();
        fromDate.setDate(now.getDate() - 14);
        toDate = new Date();
        break;
      case "1month":
        fromDate = new Date();
        fromDate.setMonth(now.getMonth() - 1);
        toDate = new Date();
        break;
      case "3months":
        fromDate = new Date();
        fromDate.setMonth(now.getMonth() - 3);
        toDate = new Date();
        break;
      case "9months":
        fromDate = new Date();
        fromDate.setMonth(now.getMonth() - 9);
        toDate = new Date();
        break;
      case "1year":
        fromDate = new Date();
        fromDate.setFullYear(now.getFullYear() - 1);
        toDate = new Date();
        break;
      default:
        if (startDate && endDate) {
          fromDate = new Date(startDate);
          toDate = new Date(endDate);
        }
        break;
    }

    const dateFilter =
      fromDate && toDate
        ? { createdAt: { $gte: fromDate, $lte: toDate } }
        : {};

    const prevDuration = toDate - fromDate;
    const prevFromDate = new Date(fromDate.getTime() - prevDuration);
    const prevToDate = new Date(fromDate.getTime());

    const prevDateFilter =
      fromDate && toDate
        ? { createdAt: { $gte: prevFromDate, $lte: prevToDate } }
        : {};

    const calcChange = (current, previous) => {
      if (previous === 0) {
        return current > 0 ? "100.00" : "0.00";
      }
      return (((current - previous) / previous) * 100).toFixed(2);
    };

    // Filters for non-privileged users
    const leadFilter = isPrivilegedUser
      ? {}
      : { "current_assigned.user_id": new mongoose.Types.ObjectId(userId) };
    const handoverFilter = isPrivilegedUser
      ? {}
      : { "other_details.submitted_by_BD": user.name };

    // Leads
    const totalLeads = await bdleadsModells.countDocuments({
      ...dateFilter,
      ...leadFilter,
    });
    const prevTotalLeads = await bdleadsModells.countDocuments({
      ...prevDateFilter,
      ...leadFilter,
    });

    // Handovers
    const totalHandovers = await handoversheet.countDocuments({
      ...dateFilter,
      ...handoverFilter,
    });
    const prevHandovers = await handoversheet.countDocuments({
      ...prevDateFilter,
      ...handoverFilter,
    });

    // Conversion rate
    const conversionRate =
      totalLeads > 0
        ? ((totalHandovers / totalLeads) * 100).toFixed(2)
        : "0.00";
    const prevConversionRate =
      prevTotalLeads > 0
        ? ((prevHandovers / prevTotalLeads) * 100).toFixed(2)
        : "0.00";

    // total_assigned_tasks → sum project_kwp / 1000
    const currentKwpAgg = await handoversheet.aggregate([
      {
        $match: {
          ...dateFilter,
          ...handoverFilter,
          "project_detail.project_kwp": { $exists: true, $ne: "" },
        },
      },
      {
        $addFields: {
          kwpValue: {
            $divide: [{ $toDouble: "$project_detail.project_kwp" }, 1000],
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$kwpValue" } } },
    ]);
    const totalAssignedTasks = currentKwpAgg[0]?.total || 0;

    const prevKwpAgg = await handoversheet.aggregate([
      {
        $match: {
          ...prevDateFilter,
          ...handoverFilter,
          "project_detail.project_kwp": { $exists: true, $ne: "" },
        },
      },
      {
        $addFields: {
          kwpValue: {
            $divide: [{ $toDouble: "$project_detail.project_kwp" }, 1000],
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$kwpValue" } } },
    ]);
    const prevAssignedTasks = prevKwpAgg[0]?.total || 0;

    // Amount earned (same as before)
    const currentEarningAgg = await handoversheet.aggregate([
      {
        $match: {
          ...dateFilter,
          ...handoverFilter,
          other_details: { $exists: true, $ne: null },
          "other_details.service": { $regex: /^[0-9.]+$/ },
        },
      },
      { $addFields: { numericService: { $toDouble: "$other_details.service" } } },
      { $group: { _id: null, total: { $sum: "$numericService" } } },
    ]);
    const totalAmountEarned = currentEarningAgg[0]?.total || 0;

    const prevEarningAgg = await handoversheet.aggregate([
      {
        $match: {
          ...prevDateFilter,
          ...handoverFilter,
          other_details: { $exists: true, $ne: null },
          "other_details.service": { $regex: /^[0-9.]+$/ },
        },
      },
      { $addFields: { numericService: { $toDouble: "$other_details.service" } } },
      { $group: { _id: null, total: { $sum: "$numericService" } } },
    ]);
    const prevAmountEarned = prevEarningAgg[0]?.total || 0;

    res.json({
      total_leads: totalLeads,
      total_leads_change_percentage: +calcChange(totalLeads, prevTotalLeads),
      conversion_rate_percentage: +conversionRate,
      conversion_rate_change_percentage: +calcChange(
        +conversionRate,
        +prevConversionRate
      ),
      total_assigned_tasks: totalAssignedTasks.toFixed(2),
      total_assigned_tasks_change_percentage: +calcChange(
        totalAssignedTasks,
        prevAssignedTasks
      ),
      amount_earned: +(totalAmountEarned / 1e7).toFixed(2),
      amount_earned_change_percentage: +calcChange(
        totalAmountEarned,
        prevAmountEarned
      ),
    });
  } catch (error) {
    console.error("Lead Summary Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};



const getLeadSource = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;
    const now = new Date();
    let fromDate, toDate;

    // ---- Privileged User Check ----
    const userId = req.user.userId;
    const user = await userModells.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPrivilegedUser =
      ["admin", "superadmin"].includes(user.department) ||
      ["Prachi Singh"].includes(user.name) ||
      (user.department === "BD" && user.role === "manager");

    // ---- Date Range Processing ----
    const rangeKeyMap = {
      today: "day",
      "1 week": "week",
      "2 weeks": "2week",
      "1 month": "1month",
      "3 months": "3months",
      "9 months": "9months",
      "1 year": "1year",
    };

    const normalizedRange = rangeKeyMap[(range || "").toLowerCase()] || range;

    switch (normalizedRange) {
      case "day":
        fromDate = new Date(now.setHours(0, 0, 0, 0));
        toDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case "week":
        fromDate = new Date();
        fromDate.setDate(now.getDate() - 7);
        toDate = new Date();
        break;
      case "2week":
        fromDate = new Date();
        fromDate.setDate(now.getDate() - 14);
        toDate = new Date();
        break;
      case "1month":
        fromDate = new Date();
        fromDate.setMonth(now.getMonth() - 1);
        toDate = new Date();
        break;
      case "3months":
        fromDate = new Date();
        fromDate.setMonth(now.getMonth() - 3);
        toDate = new Date();
        break;
      case "9months":
        fromDate = new Date();
        fromDate.setMonth(now.getMonth() - 9);
        toDate = new Date();
        break;
      case "1year":
        fromDate = new Date();
        fromDate.setFullYear(now.getFullYear() - 1);
        toDate = new Date();
        break;
      default:
        if (startDate && endDate) {
          fromDate = new Date(startDate);
          toDate = new Date(endDate);
        }
        break;
    }

    // ---- Base Date Filter ----
    const dateFilter =
      fromDate && toDate
        ? {
            createdAt: {
              $gte: fromDate,
              $lte: toDate,
            },
          }
        : {};

    // ---- Add User Restriction if Not Privileged ----
    if (!isPrivilegedUser) {
      dateFilter["current_assigned.user_id"] =  new mongoose.Types.ObjectId(userId);
    }

    // ---- Aggregation ----
    const leadAggregation = await bdleadsModells.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$source.from",
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$count" },
          sources: {
            $push: {
              source: "$_id",
              count: "$count",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          sources: {
            $map: {
              input: "$sources",
              as: "s",
              in: {
                source: "$$s.source",
                percentage: {
                  $round: [
                    { $multiply: [{ $divide: ["$$s.count", "$total"] }, 100] },
                    2,
                  ],
                },
              },
            },
          },
        },
      },
    ]);

    // ---- Normalize & Prepare Response ----
    const sourceList = leadAggregation[0]?.sources || [];

    const normalizedSources = {};
    sourceList.forEach((item) => {
      const key = item.source || "Others";
      if (!normalizedSources[key]) normalizedSources[key] = 0;
      normalizedSources[key] += item.percentage;
    });

    const leadSourceSummary = [
      {
        source: "Social Media",
        percentage: +(normalizedSources["Social Media"]?.toFixed(2) || 0),
      },
      {
        source: "Marketing",
        percentage: +(normalizedSources["Marketing"]?.toFixed(2) || 0),
      },
      {
        source: "IVR/My Operator",
        percentage: +(normalizedSources["IVR/My Operator"]?.toFixed(2) || 0),
      },
      {
        source: "Referred by",
        percentage: +(normalizedSources["Referred by"]?.toFixed(2) || 0),
      },
      {
        source: "Others",
        percentage: +(normalizedSources["Others"]?.toFixed(2) || 0),
      },
    ];

    res.json({ lead_sources: leadSourceSummary });
  } catch (error) {
    console.error("Lead Source Summary Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};


//task dashboard

const taskDashboard = async (req, res) => {
  try {
    const { userId } = req.user;
    const { range, startDate, endDate } = req.query;

    const user = await userModells.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPrivilegedUser =
      ["admin", "superadmin"].includes(user.department) ||
      ["Prachi Singh"].includes(user.name) ||
      (user.department === "BD" && user.role === "manager");

    // Date range logic
    let fromDate, toDate;
    const now = new Date();

    const rangeKeyMap = {
      today: "day",
      "1 week": "week",
      "2 weeks": "2week",
      "1 month": "1month",
      "3 months": "3months",
      "9 months": "9months",
      "1 year": "1year",
    };

    const normalizedRange = rangeKeyMap[(range || "").toLowerCase()] || range;

    switch (normalizedRange) {
      case "day":
        fromDate = new Date(now.setHours(0, 0, 0, 0));
        toDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case "week":
        fromDate = new Date();
        fromDate.setDate(now.getDate() - 7);
        toDate = new Date();
        break;
      case "2week":
        fromDate = new Date();
        fromDate.setDate(now.getDate() - 14);
        toDate = new Date();
        break;
      case "1month":
        fromDate = new Date();
        fromDate.setMonth(now.getMonth() - 1);
        toDate = new Date();
        break;
      case "3months":
        fromDate = new Date();
        fromDate.setMonth(now.getMonth() - 3);
        toDate = new Date();
        break;
      case "9months":
        fromDate = new Date();
        fromDate.setMonth(now.getMonth() - 9);
        toDate = new Date();
        break;
      case "1year":
        fromDate = new Date();
        fromDate.setFullYear(now.getFullYear() - 1);
        toDate = new Date();
        break;
      default:
        if (startDate && endDate) {
          fromDate = new Date(startDate);
          toDate = new Date(endDate);
        }
        break;
    }

    // Build match filter
    let matchStage = {};
    if (fromDate && toDate) {
      matchStage.createdAt = {
        $gte: fromDate,
        $lte: toDate,
      };
    }
    if (!isPrivilegedUser) {
      matchStage.assigned_to = new mongoose.Types.ObjectId(userId);
    }

    const userTaskStats = await task.aggregate([
      { $match: matchStage },
      { $unwind: "$assigned_to" },
      {
        $group: {
          _id: "$assigned_to",
          assigned_tasks: { $sum: 1 },
          completed_tasks: {
            $sum: {
              $cond: [{ $eq: ["$current_status", "completed"] }, 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          user_id: "$user._id",
          name: "$user.name",
          assigned_tasks: 1,
          completed_tasks: 1,
        },
      },
      ...(isPrivilegedUser
        ? []
        : [{ $match: { user_id: new mongoose.Types.ObjectId(userId) } }]),
    ]);

    res.json({ per_member_task_summary: userTaskStats });
  } catch (error) {
    console.error("Team Task Summary Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};


// Lead status summary
const leadSummary = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;
    const now = new Date();
    let fromDate, toDate;

    // ---- Privileged User Check ----
    const userId = req.user.userId;
    const user = await userModells.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPrivilegedUser =
      ["admin", "superadmin"].includes(user.department) ||
      ["Prachi Singh"].includes(user.name) ||
      (user.department === "BD" && user.role === "manager");

    // ---- Date Range Mapping ----
    const rangeKeyMap = {
      today: "day",
      "1 day": "day",
      "one day": "day",
      "1 week": "week",
      "one week": "week",
      "2 weeks": "2weeks",
      "two weeks": "2weeks",
      "1 month": "1month",
      "one month": "1month",
      "3 months": "3months",
      "9 months": "9months",
      "1 year": "1year",
    };

    const normalizedRange = rangeKeyMap[(range || "").toLowerCase()] || range;

    switch (normalizedRange) {
      case "day":
        fromDate = new Date(now.setHours(0, 0, 0, 0));
        toDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case "week":
        fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        toDate = new Date();
        break;
      case "2weeks":
        fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 14);
        toDate = new Date();
        break;
      case "1month":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 1);
        toDate = new Date();
        break;
      case "3months":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 3);
        toDate = new Date();
        break;
      case "9months":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 9);
        toDate = new Date();
        break;
      case "1year":
        fromDate = new Date();
        fromDate.setFullYear(fromDate.getFullYear() - 1);
        toDate = new Date();
        break;
      default:
        if (startDate && endDate) {
          fromDate = new Date(startDate);
          toDate = new Date(endDate);
        }
        break;
    }

    // ---- Date Filter ----
    const matchFilter =
      fromDate && toDate
        ? {
            createdAt: { $gte: fromDate, $lte: toDate },
          }
        : {};

    // ---- Restrict for Non-Privileged Users ----
    if (!isPrivilegedUser) {
      matchFilter["current_assigned.user_id"] = new mongoose.Types.ObjectId(userId);
    }

    // ---- Aggregation on current_status.name ----
    const leadAggregation = await bdleadsModells.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$current_status.name",
          count: { $sum: 1 },
        },
      },
    ]);

    // ---- Map results to required fields ----
    const leadStatusSummary = {
      initial_leads: leadAggregation.find(l => l._id === "initial")?.count || 0,
      followup_leads: leadAggregation.find(l => l._id === "follow up")?.count || 0,
      warm_leads: leadAggregation.find(l => l._id === "warm")?.count || 0,
      won_leads: leadAggregation.find(l => l._id === "won")?.count || 0,
      dead_leads: leadAggregation.find(l => l._id === "dead")?.count || 0,
    };

    res.json({
      lead_status_summary: leadStatusSummary,
      filter_used: {
        range: range || "custom",
        from: fromDate?.toISOString(),
        to: toDate?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Lead Status Summary Error:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Total Lead Conversition Ratio

const leadconversationrate = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;
    const userId = req.user.userId;

    // Fetch user info
    const user = await userModells.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPrivilegedUser =
      ["admin", "superadmin"].includes(user.department) ||
      ["Prachi Singh"].includes(user.name) ||
      (user.department === "BD" && user.role === "manager");

    let fromDate, toDate;
    const rangeKeyMap = {
      today: "day",
      "1 day": "day",
      "one day": "day",
      "1 week": "week",
      "one week": "week",
      "2 weeks": "2weeks",
      "two weeks": "2weeks",
      "1 month": "1month",
      "one month": "1month",
      "3 months": "3months",
      "9 months": "9months",
      "1 year": "1year",
    };

    const normalizedRange = rangeKeyMap[(range || "").toLowerCase()] || range;

    switch (normalizedRange) {
      case "day":
        fromDate = new Date();
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date();
        toDate.setHours(23, 59, 59, 999);
        break;
      case "week":
        fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        toDate = new Date();
        break;
      case "2weeks":
        fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 14);
        toDate = new Date();
        break;
      case "1month":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 1);
        toDate = new Date();
        break;
      case "3months":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 3);
        toDate = new Date();
        break;
      case "9months":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 9);
        toDate = new Date();
        break;
      case "1year":
        fromDate = new Date();
        fromDate.setFullYear(fromDate.getFullYear() - 1);
        toDate = new Date();
        break;
      default:
        if (startDate && endDate) {
          fromDate = new Date(startDate);
          toDate = new Date(endDate);
        } else {
          return res.status(400).json({
            message: "Please provide a valid date range or custom dates",
          });
        }
    }

    const dateFilter = {
      createdAt: { $gte: fromDate, $lte: toDate },
    };

    const leadFilter = { ...dateFilter };
    const handoverFilter = { ...dateFilter };

    if (!isPrivilegedUser) {
      leadFilter["current_assigned.user_id"] = new mongoose.Types.ObjectId(userId);
      handoverFilter["other_details.submitted_by_BD"] = user.name;
    }

    const leadAggregation = await bdleadsModells.aggregate([
      { $match: leadFilter },
      {
        $group: { _id: null, total: { $sum: 1 } },
      },
      {
        $project: { _id: 0, totalLeads: "$total" },
      },
    ]);

    const totalLeads = leadAggregation[0]?.totalLeads || 0;
    const totalHandovers = await handoversheet.countDocuments(handoverFilter);

    const conversionRate =
      totalLeads > 0
        ? ((totalHandovers / totalLeads) * 100).toFixed(2)
        : "0.00";

    res.json({
      filter_used: {
        range: normalizedRange || "custom",
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      total_leads: totalLeads,
      total_handovers: totalHandovers,
      conversion_rate_percentage: parseFloat(conversionRate),
    });
  } catch (error) {
    console.error("Lead Conversion Error:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

//lead funnel
const leadFunnel = async (req, res) => {
  try {
    const { range, startDate, endDate, fields } = req.query;
    const userId = req.user.userId;

    // Get user details
    const user = await userModells.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPrivilegedUser =
      ["admin", "superadmin"].includes(user.department) ||
      ["Prachi Singh"].includes(user.name) ||
      (user.department === "BD" && user.role === "manager");

    const showLead = !fields || fields.includes("lead");
    const showCapacity = !fields || fields.includes("capacity");

    let fromDate, toDate;
    const rangeKeyMap = {
      today: "day",
      "1 day": "day",
      "one day": "day",
      "1 week": "week",
      "one week": "week",
      "2 weeks": "2weeks",
      "two weeks": "2weeks",
      "1 month": "1month",
      "one month": "1month",
      "3 months": "3months",
      "9 months": "9months",
      "1 year": "1year",
    };

    const normalizedRange = rangeKeyMap[(range || "").toLowerCase()] || range;

    switch (normalizedRange) {
      case "day":
        fromDate = new Date();
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date();
        toDate.setHours(23, 59, 59, 999);
        break;
      case "week":
        fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        toDate = new Date();
        break;
      case "2weeks":
        fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 14);
        toDate = new Date();
        break;
      case "1month":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 1);
        toDate = new Date();
        break;
      case "3months":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 3);
        toDate = new Date();
        break;
      case "9months":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 9);
        toDate = new Date();
        break;
      case "1year":
        fromDate = new Date();
        fromDate.setFullYear(fromDate.getFullYear() - 1);
        toDate = new Date();
        break;
      default:
        if (startDate && endDate) {
          fromDate = new Date(startDate);
          toDate = new Date(endDate);
        } else {
          return res.status(400).json({
            message: "Please provide a valid date range or custom dates",
          });
        }
    }

    // Base filter
    const dateFilter = {
      createdAt: { $gte: fromDate, $lte: toDate },
    };

    if (!isPrivilegedUser) {
      dateFilter["current_assigned.user_id"] = new mongoose.Types.ObjectId(userId);
    }

    const stages = ["initial", "follow up", "warm", "won", "dead"];
    const result = {};

    for (const stage of stages) {
      const stageFilter = { ...dateFilter, "current_status.name": stage };
      const docs = await bdleadsModells.find(stageFilter);

      let totalCapacity = 0;
      if (showCapacity) {
        for (const doc of docs) {
          const rawCap = doc.capacity;
          if (rawCap) {
            const numeric = parseFloat(String(rawCap).replace(/[^\d.]/g, ""));
            if (!isNaN(numeric)) {
              totalCapacity += numeric;
            }
          }
        }
      }

      result[stage] = {};
      if (showLead) result[stage].count = docs.length;
      if (showCapacity)
        result[stage].capacity = parseFloat(totalCapacity.toFixed(2));
    }

    // Payment calculation
    if (showCapacity) {
      const handoverDocs = await handoversheet.find(dateFilter);
      let totalPayment = 0;

      for (const doc of handoverDocs) {
        const gstRaw = doc?.other_details?.total_gst;
        if (gstRaw) {
          const numeric = parseFloat(String(gstRaw).replace(/[^\d.]/g, ""));
          if (!isNaN(numeric)) {
            totalPayment += numeric;
          }
        }
      }

      result["payment"] = parseFloat(totalPayment.toFixed(2));
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching stats:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


const leadWonAndLost = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;
    const { userId } = req.user;

    const user = await userModells.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPrivilegedUser =
      ["admin", "superadmin"].includes(user.department) ||
      ["Prachi Singh"].includes(user.name) ||
      (user.department === "BD" && user.role === "manager");

    // Date filter
    let fromDate, toDate;
    const now = new Date();
    const rangeKeyMap = {
      today: "day",
      "1 day": "day",
      "1 week": "week",
      "2 weeks": "2weeks",
      "1 month": "1month",
      "3 months": "3months",
      "9 months": "9months",
      "1 year": "1year",
    };
    const normalizedRange = rangeKeyMap[range || ""] || range;
    switch (normalizedRange) {
      case "day":
        fromDate = new Date(now.setHours(0, 0, 0, 0));
        toDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case "week":
        fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        toDate = new Date();
        break;
      case "2weeks":
        fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 14);
        toDate = new Date();
        break;
      case "1month":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 1);
        toDate = new Date();
        break;
      case "3months":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 3);
        toDate = new Date();
        break;
      case "9months":
        fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 9);
        toDate = new Date();
        break;
      case "1year":
        fromDate = new Date();
        fromDate.setFullYear(fromDate.getFullYear() - 1);
        toDate = new Date();
        break;
      default:
        if (startDate && endDate) {
          fromDate = new Date(startDate);
          toDate = new Date(endDate);
        }
        break;
    }

    const dateFilter =
      fromDate && toDate ? { createdAt: { $gte: fromDate, $lte: toDate } } : {};

    // Base lead filter
    const leadUserFilter = !isPrivilegedUser
      ? { "current_assigned.user_id": new mongoose.Types.ObjectId(userId) }
      : {};

    // Counts
    const wonCount = await bdleadsModells.countDocuments({
      ...dateFilter,
      ...leadUserFilter,
      "current_status.name": "won"
    });

    const followUpCount = await bdleadsModells.countDocuments({
      ...dateFilter,
      ...leadUserFilter,
      "current_status.name": "follow up"
    });

    const warmCount = await bdleadsModells.countDocuments({
      ...dateFilter,
      ...leadUserFilter,
      "current_status.name": "warm"
    });

    const deadCount = await bdleadsModells.countDocuments({
      ...dateFilter,
      ...leadUserFilter,
      "current_status.name": "dead"
    });

    const initialCount = await bdleadsModells.countDocuments({
      ...dateFilter,
      ...leadUserFilter,
      "current_status.name": "initial"
    });

    const totalLeads = wonCount + followUpCount + warmCount + deadCount + initialCount;
    const activeLeads = followUpCount + warmCount + initialCount;
    const lostLeads = deadCount;

    const lostPercentage =
      totalLeads > 0 ? ((lostLeads / totalLeads) * 100).toFixed(2) : "0.00";
    const wonPercentage =
      totalLeads > 0 ? ((wonCount / totalLeads) * 100).toFixed(2) : "0.00";

    // Handovers filter for non-privileged
    const handoverUserFilter = !isPrivilegedUser
      ? { "other_details.submitted_by_BD": user.name }
      : {};

    const [totalHandovers, totalTasks] = await Promise.all([
      handoversheet.countDocuments({ ...dateFilter, ...handoverUserFilter }),
      task.countDocuments(),
    ]);

    const conversionRate =
      totalLeads > 0
        ? ((totalHandovers / totalLeads) * 100).toFixed(2)
        : "0.00";

    // Monthly aggregation
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const aggregateByStatus = async (statusName) => {
      return bdleadsModells.aggregate([
        { $match: { ...dateFilter, ...leadUserFilter, "current_status.name": statusName } },
        {
          $group: {
            _id: { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
      ]);
    };

    const [aggWon, aggFollowUp, aggWarm, aggDead, aggInitial] = await Promise.all([
      aggregateByStatus("won"),
      aggregateByStatus("follow up"),
      aggregateByStatus("warm"),
      aggregateByStatus("dead"),
      aggregateByStatus("initial"),
    ]);

    const monthlyDataMap = {};
    const processAggregate = (aggArray, field) => {
      aggArray.forEach(({ _id, count }) => {
        const key = `${_id.month}-${_id.year}`;
        if (!monthlyDataMap[key]) {
          monthlyDataMap[key] = { month: monthNames[_id.month - 1], year: _id.year, total: 0, won: 0, lost: 0 };
        }
        monthlyDataMap[key][field] += count;
      });
    };

    processAggregate(aggWon, "won");
    processAggregate(aggFollowUp, "total");
    processAggregate(aggWarm, "total");
    processAggregate(aggDead, "lost");
    processAggregate(aggDead, "total");
    processAggregate(aggInitial, "total");

    const monthlyData = Object.values(monthlyDataMap).map(item => {
      const wonPct = item.total > 0 ? ((item.won / item.total) * 100).toFixed(2) : "0.00";
      const lostPct = item.total > 0 ? ((item.lost / item.total) * 100).toFixed(2) : "0.00";
      return { month: item.month, won_percentage: +wonPct, lost_percentage: +lostPct };
    }).sort((a, b) => monthNames.indexOf(a.month) - monthNames.indexOf(b.month));

    res.json({
      total_leads: totalLeads,
      active_leads: activeLeads,
      lost_leads: lostLeads,
      won_leads: wonCount,
      won_leads_percentage: +wonPercentage,
      lost_leads_percentage: +lostPercentage,
      conversion_rate_percentage: +conversionRate,
      monthly_data: monthlyData,
      isPrivilegedUser
    });

  } catch (error) {
    console.error("Lead Summary Error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};



module.exports = {
  getLeadSummary,
  getLeadSource,
  taskDashboard,
  leadSummary,
  leadconversationrate,
  leadFunnel,
  leadWonAndLost,
};
