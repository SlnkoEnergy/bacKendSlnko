const initiallead = require("../../Modells/initialBdLeadModells");
const followUpBdleadModells = require("../../Modells/followupbdModells");
const warmbdLeadModells = require("../../Modells/warmbdLeadModells");
const wonleadModells = require("../../Modells/wonleadModells");
const deadleadModells = require("../../Modells/deadleadModells");
const createbdleads = require("../../Modells/createBDleadModells");
const handoversheet = require("../../Modells/handoversheetModells");
const task = require("../../Modells/bdleads/task");
const userModells = require("../../Modells/userModells");
const mongoose = require("mongoose");
const { Parser } = require("json2csv");
const bdleadsModells = require("../../Modells/bdleads/bdleadsModells");
const axios = require("axios");
const FormData = require("form-data");
const { shouldUpdateStatus } = require("../../utils/shouldUpdateStatus");
const group = require("../../Modells/bdleads/group");

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

const getLeadSummary = async (req, res) => {
  try {
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
        ? {
            createdAt: {
              $gte: fromDate,
              $lte: toDate,
            },
          }
        : {};

    // Previous period
    const prevDuration = toDate - fromDate;
    const prevFromDate = new Date(fromDate.getTime() - prevDuration);
    const prevToDate = new Date(fromDate.getTime());

    const prevDateFilter =
      fromDate && toDate
        ? {
            createdAt: {
              $gte: prevFromDate,
              $lte: prevToDate,
            },
          }
        : {};

    const calcChange = (current, previous) => {
      if (previous === 0) {
        return current > 0 ? "100.00" : "0.00";
      }
      return (((current - previous) / previous) * 100).toFixed(2);
    };

    // Leads
    const totalLeads = await createbdleads.countDocuments(dateFilter);
    const prevTotalLeads = await createbdleads.countDocuments(prevDateFilter);

    // Handovers
    const totalHandovers = await handoversheet.countDocuments(dateFilter);
    const prevHandovers = await handoversheet.countDocuments(prevDateFilter);

    // Conversion rate
    const conversionRate =
      totalLeads > 0
        ? ((totalHandovers / totalLeads) * 100).toFixed(2)
        : "0.00";

    const prevConversionRate =
      prevTotalLeads > 0
        ? ((prevHandovers / prevTotalLeads) * 100).toFixed(2)
        : "0.00";

    // Tasks
    const totalAssignedTasks = await task.countDocuments({
      assigned_to: { $exists: true, $not: { $size: 0 } },
      ...dateFilter,
    });

    const prevAssignedTasks = await task.countDocuments({
      assigned_to: { $exists: true, $not: { $size: 0 } },
      ...prevDateFilter,
    });

    const currentEarningAgg = await handoversheet.aggregate([
      {
        $match: {
          ...dateFilter,
          other_details: {
            $exists: true,
            $ne: null,
          },
          "other_details.service": {
            $regex: /^[0-9.]+$/, // include only number-like strings
          },
        },
      },
      {
        $addFields: {
          numericService: { $toDouble: "$other_details.service" },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$numericService" },
        },
      },
    ]);

    const totalAmountEarned = currentEarningAgg[0]?.total || 0;

    const prevEarningAgg = await handoversheet.aggregate([
      {
        $match: {
          ...prevDateFilter,
          other_details: { $exists: true, $ne: null },
          "other_details.service": { $regex: /^[0-9.]+$/ },
        },
      },
      {
        $addFields: {
          numericService: { $toDouble: "$other_details.service" },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$numericService" },
        },
      },
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
      total_assigned_tasks: totalAssignedTasks,
      total_assigned_tasks_change_percentage: +calcChange(
        totalAssignedTasks,
        prevAssignedTasks
      ),
      amount_earned: +(totalAmountEarned / 1e7).toFixed(2), // 💰 in Cr
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
        ? {
            createdAt: {
              $gte: fromDate,
              $lte: toDate,
            },
          }
        : {};

    const leadAggregation = await createbdleads.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$source",
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
    const userTaskStats = await task.aggregate([
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

    let fromDate, toDate;
    const now = new Date();

    // Normalize human-readable range inputs from frontend
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

    // Set dynamic date range
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

      case "2week":
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

    // Apply date filter if applicable
    const dateFilter =
      fromDate && toDate
        ? {
            createdAt: {
              $gte: fromDate,
              $lte: toDate,
            },
          }
        : {};

    // Parallel aggregation of lead status counts
    const [initialLeadAgg, followupAgg, warmLeadAgg, wonLeadAgg, deadLeadAgg] =
      await Promise.all([
        initiallead.aggregate([{ $match: dateFilter }, { $count: "count" }]),
        followUpBdleadModells.aggregate([
          { $match: dateFilter },
          { $count: "count" },
        ]),
        warmbdLeadModells.aggregate([
          { $match: dateFilter },
          { $count: "count" },
        ]),
        wonleadModells.aggregate([{ $match: dateFilter }, { $count: "count" }]),
        deadleadModells.aggregate([
          { $match: dateFilter },
          { $count: "count" },
        ]),
      ]);

    const leadStatusSummary = {
      initial_leads: initialLeadAgg[0]?.count || 0,
      followup_leads: followupAgg[0]?.count || 0,
      warm_leads: warmLeadAgg[0]?.count || 0,
      won_leads: wonLeadAgg[0]?.count || 0,
      dead_leads: deadLeadAgg[0]?.count || 0,
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

    const now = new Date();
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
      createdAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    };

    const leadAggregation = await createbdleads.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          totalLeads: "$total",
        },
      },
    ]);

    const totalLeads = leadAggregation[0]?.totalLeads || 0;

    const totalHandovers = await handoversheet.countDocuments(dateFilter);

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

    const showLead = !fields || fields.includes("lead");
    const showCapacity = !fields || fields.includes("capacity");

    const now = new Date();
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
      createdAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    };

    const models = [
      { name: "initial", model: initiallead },
      { name: "followup", model: followUpBdleadModells },
      { name: "warm", model: warmbdLeadModells },
      { name: "won", model: wonleadModells },
      { name: "dead", model: deadleadModells },
    ];

    const result = {};

    for (const { name, model } of models) {
      const docs = await model.find(dateFilter);
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

      result[name] = {};
      if (showLead) result[name].count = docs.length;
      if (showCapacity)
        result[name].capacity = parseFloat(totalCapacity.toFixed(2));
    }

    // Apply same date filter to handoversheet
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

    // Model Map
    const modelMap = {
      won: wonleadModells,
      followUp: followUpBdleadModells,
      warm: warmbdLeadModells,
      dead: deadleadModells,
      initial: initiallead,
    };

    const [wonCount, followUpCount, warmCount, deadCount, initialCount] =
      await Promise.all([
        modelMap.won.countDocuments(dateFilter),
        modelMap.followUp.countDocuments(dateFilter),
        modelMap.warm.countDocuments(dateFilter),
        modelMap.dead.countDocuments(dateFilter),
        modelMap.initial.countDocuments(dateFilter),
      ]);

    const totalLeads =
      wonCount + followUpCount + warmCount + deadCount + initialCount;
    const activeLeads = wonCount + followUpCount + warmCount + initialCount;
    const lostLeads = deadCount;

    const lostPercentage =
      totalLeads > 0 ? ((lostLeads / totalLeads) * 100).toFixed(2) : "0.00";
    const wonPercentage =
      totalLeads > 0 ? ((wonCount / totalLeads) * 100).toFixed(2) : "0.00";

    const [totalHandovers, totalTasks] = await Promise.all([
      handoversheet.countDocuments(dateFilter),
      task.countDocuments(),
    ]);

    const conversionRate =
      totalLeads > 0
        ? ((totalHandovers / totalLeads) * 100).toFixed(2)
        : "0.00";

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const aggregateAll = async (model) => {
      return model.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              month: { $month: "$createdAt" },
              year: { $year: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
      ]);
    };

    const [aggWon, aggFollowUp, aggWarm, aggDead, aggInitial] =
      await Promise.all([
        aggregateAll(modelMap.won),
        aggregateAll(modelMap.followUp),
        aggregateAll(modelMap.warm),
        aggregateAll(modelMap.dead),
        aggregateAll(modelMap.initial),
      ]);

    const monthlyDataMap = {};

    const processAggregate = (aggArray, field) => {
      aggArray.forEach(({ _id, count }) => {
        const key = `${_id.month}-${_id.year}`;
        if (!monthlyDataMap[key]) {
          monthlyDataMap[key] = {
            month: monthNames[_id.month - 1],
            year: _id.year,
            total: 0,
            won: 0,
            lost: 0,
          };
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

    const monthlyData = Object.values(monthlyDataMap).map((item) => {
      const wonPercentage =
        item.total > 0 ? ((item.won / item.total) * 100).toFixed(2) : "0.00";
      const lostPercentage =
        item.total > 0 ? ((item.lost / item.total) * 100).toFixed(2) : "0.00";

      return {
        month: item.month,
        won_percentage: +wonPercentage,
        lost_percentage: +lostPercentage,
      };
    });

    monthlyData.sort((a, b) => {
      const monthIndexA = monthNames.indexOf(a.month);
      const monthIndexB = monthNames.indexOf(b.month);
      return monthIndexA - monthIndexB;
    });

    res.json({
      total_leads: totalLeads,
      active_leads: activeLeads,
      lost_leads: lostLeads,
      won_leads: wonCount,
      won_leads_percentage: +wonPercentage,
      lost_leads_percentage: +lostPercentage,
      conversion_rate_percentage: +conversionRate,
      monthly_data: monthlyData,
    });
  } catch (error) {
    console.error("Lead Summary Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
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
    const { _id } = req.params;
    const { assigned_to } = req.body;

    if (!_id || !assigned_to) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const user = await userModells.findById(assigned_to);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const lead = await bdleadsModells.findById(_id);
    if (!lead) {
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });
    }

    const status = lead.current_status?.name || "";

    lead.assigned_to.push({
      user_id: user._id,
      status,
    });

    // Save the document
    await lead.save();

    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
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
    } = req.query;

    const userId = req.user.userId;
    const user = await userModells.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPrivilegedUser =
      ["admin", "superadmin"].includes(user.department) ||
      (user.department === "BD" && user.role === "manager");

    const match = {};
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

    if (req.query.stateFilter) {
      const raw = decodeURIComponent(req.query.stateFilter);
      const stateList = raw.split(",").map((s) => s.trim());
      and.push({ "address.state": { $in: stateList } });
    }

    if (!isPrivilegedUser) {
      and.push({ "assigned_to.user_id": new mongoose.Types.ObjectId(userId) });
    }

    if (stage && stage !== "lead_without_task") {
      and.push({ "current_status.name": stage });
    }

    if (req.query.group_id) {
      and.push({ group_id: new mongoose.Types.ObjectId(req.query.group_id) });
    }

    if (fromDate && toDate) {
      const start = new Date(fromDate);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      and.push({ createdAt: { $gte: start, $lte: end } });
    }

    const inactiveDays = parseInt(req.query.inactiveFilter);
    const leadAgingFilter = parseInt(req.query.leadAgingFilter);

    if (lead_without_task === "true") {
      const leadsWithPendingOrInProgressTasks = await task.aggregate([
        { $match: { current_status: { $ne: "completed" } } },
        { $group: { _id: "$lead_id" } },
      ]);
      const leadsToExclude = leadsWithPendingOrInProgressTasks.map((doc) => doc._id);

      and.push({
        $and: [
          { _id: { $nin: leadsToExclude } },
          { "current_status.name": { $ne: "won" } },
        ],
      });
    }

    if (and.length) match.$and = and;

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

    const totalCountAgg = await bdleadsModells.aggregate([
      { $match: match },
      { $count: "count" },
    ]);
    const total = totalCountAgg[0]?.count || 0;

    const pipeline = [
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },

      // Assigned user population
      {
        $lookup: {
          from: "users",
          localField: "assigned_to.user_id",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, name: 1 } }],
          as: "assigned_user_objs",
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
                  $let: {
                    vars: {
                      matched: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$assigned_user_objs",
                              as: "u",
                              cond: { $eq: ["$$u._id", "$$a.user_id"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      _id: "$$matched._id",
                      name: "$$matched.name",
                    },
                  },
                },
              },
            },
          },
        },
      },
      { $project: { assigned_user_objs: 0 } },

      // Current assigned user
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
      { $project: { current_assigned_user: 0 } },

      // Submitted by user
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

      // Status history user mapping
      {
        $lookup: {
          from: "users",
          let: { ids: "$status_history.user_id" },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$ids"] } } },
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

      // Task Meta: last updated
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
          inactiveDays: {
            $divide: [
              { $subtract: [new Date(), "$lastModifiedTask"] },
              1000 * 60 * 60 * 24,
            ],
          },
        },
      },
      ...(inactiveDays
        ? [
            {
              $match: {
                inactiveDays: { $gte: inactiveDays },
              },
            },
          ]
        : []),

      {
        $addFields: {
          wonStatusDate: {
            $let: {
              vars: {
                wonEntry: {
                  $first: {
                    $filter: {
                      input: "$status_history",
                      as: "s",
                      cond: { $eq: ["$$s.status", "won"] },
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
      ...(leadAgingFilter
        ? [
            {
              $match: {
                leadAging: { $gte: leadAgingFilter },
              },
            },
          ]
        : []),

      // Handover + handover_status logic
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
          handover: {
            $cond: [
              {
                $and: [
                  { $eq: ["$current_status.name", "won"] },
                  { $gt: [{ $size: "$handover_info" }, 0] },
                ],
              },
              true,
              false,
            ],
          },
          handover_status: {
            $cond: [
              { $gt: [{ $size: "$handover_info" }, 0] },
              {
                $switch: {
                  branches: [
                    {
                      case: {
                        $eq: [
                          { $arrayElemAt: ["$handover_info.status_of_handoversheet", 0] },
                          "draft",
                        ],
                      },
                      then: "in process",
                    },
                    {
                      case: {
                        $eq: [
                          { $arrayElemAt: ["$handover_info.status_of_handoversheet", 0] },
                          "Rejected",
                        ],
                      },
                      then: "rejected",
                    },
                    {
                      case: {
                        $eq: [
                          { $arrayElemAt: ["$handover_info.status_of_handoversheet", 0] },
                          "submitted",
                        ],
                      },
                      then: "completed",
                    },
                  ],
                  default: "unknown",
                },
              },
              null,
            ],
          },
        },
      },
      ...(handover_statusFilter
        ? [
            {
              $match: {
                handover_status: handover_statusFilter,
              },
            },
          ]
        : []),

      // Group info
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
      { $project: { task_meta: 0, handover_info: 0 } },
    ];

    const leads = await bdleadsModells.aggregate(pipeline);

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



const updateLeadStatus = async function (req, res) {
  try {
    const leads = await bdleadsModells.findById(req.params._id);
    if (!leads) return res.status(404).json({ error: "Lead not found" });

    const user_id = req.user.userId;

    leads.status_history.push({
      ...req.body,
      user_id: user_id,
    });

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
                          input: "$contact_details.mobile",
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

module.exports = {
  getLeadSummary,
  getLeadSource,
  taskDashboard,
  leadSummary,
  leadconversationrate,
  getLeadByLeadIdorId,
  leadFunnel,
  leadWonAndLost,
  editLead,
  deleteLead,
  updateAssignedToFromSubmittedBy,
  updateAssignedTo,
  exportLeadsCSV,
  updateLeadStatus,
  getAllLeads,
  getAllLeadDropdown,
  uploadDocuments,
  createBDlead,
  updateExpectedClosing,
};
