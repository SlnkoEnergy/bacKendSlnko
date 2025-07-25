const initiallead = require("../../Modells/initialBdLeadModells");
const followUpBdleadModells = require("../../Modells/followupbdModells");
const warmbdLeadModells = require("../../Modells/warmbdLeadModells");
const wonleadModells = require("../../Modells/wonleadModells");
const deadleadModells = require("../../Modells/deadleadModells");
const createbdleads = require("../../Modells/createBDleadModells");
const handoversheet = require("../../Modells/handoversheetModells");
const task = require("../../Modells/bdleads/task");


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


module.exports = {
  getLeadSummary,
  getLeadSource,
  taskDashboard,
  leadSummary,
  leadconversationrate,
  leadFunnel,
  leadWonAndLost,
};
