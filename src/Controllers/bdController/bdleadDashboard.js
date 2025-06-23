const initiallead =require("../../Modells/initialBdLeadModells");
const followUpBdleadModells = require("../../Modells/followupbdModells");
const warmbdLeadModells =require("../../Modells/warmbdLeadModells");
const wonleadModells  =require("../../Modells/wonleadModells");
const deadleadModells= require("../../Modells/deadleadModells");
const task =require("../../Modells/addtaskbdModells");
const createbdleads =require("../../Modells/createBDleadModells");
const handoversheet =require("../../Modells/handoversheetModells");


// Get All Leads
const getAllLeads = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", stage = "" } = req.query;

    const query = {
      $or: [
        { c_name: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { state: { $regex: search, $options: "i" } },
        { scheme: { $regex: search, $options: "i" } },
        { submitted_by: { $regex: search, $options: "i" } },
        {id:{$regex: search, $options:"i"}},
      ],
    };

    const stageModelMap = {
      initial: initiallead,
      followup: followUpBdleadModells,
      warm: warmbdLeadModells,
      won: wonleadModells,
      dead: deadleadModells,
    };

    // If specific stage is requested
    if (stage && stageModelMap[stage]) {
      const model = stageModelMap[stage];
      const total = await model.countDocuments(query);
      const data = await model.find(query)
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit));

      const mapped = data.map((item) => ({
        _id:item._id,
        id: item.id,
        c_name: item.c_name,
        mobile: item.mobile,
        name: item.name,
        state: item.state,
        scheme: item.scheme,
        capacity: item.capacity,
        distance: item.distance,
        entry_date: item.entry_date,
        submitted_by: item.submitted_by,
        status: stage,
      }));

      return res.status(200).json({
        message: `Leads for stage: ${stage}`,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        leads: mapped,
      });
    }

    // All stages combined
    const allLeads = (
      await Promise.all(
        Object.entries(stageModelMap).map(async ([stageName, model]) => {
          const leads = await model.find(query);
          return leads.map((item) => ({
            _id:item._id,
            id: item.id,
            c_name: item.c_name,
            mobile: item.mobile,
            name: item.name,
            state: item.state,
            scheme: item.scheme,
            capacity: item.capacity,
            distance: item.distance,
            entry_date: item.entry_date,
            submitted_by: item.submitted_by,
            status: stageName,
          }));
        })
      )
    ).flat();

    const sortedLeads = allLeads.sort(
      (a, b) => new Date(b.entry_date || b.createdAt) - new Date(a.entry_date || a.createdAt)
    );

    const total = sortedLeads.length;
    const paginatedLeads = sortedLeads.slice((page - 1) * limit, page * limit);

    res.status(200).json({
      message: "Paginated All BD Leads",
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      leads: paginatedLeads,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllLeadDropdown = async function(req, res) {
  try {
    const projection = "email id _id c_name mobile";

    const initialdata = await initiallead.find({}, projection);
    const followupdata = await followUpBdleadModells.find({}, projection);
    const warmdata = await warmbdLeadModells.find({}, projection);
    const wondata = await wonleadModells.find({}, projection);
    const deaddata = await deadleadModells.find({}, projection);

    const allLeads = [
      ...initialdata,
      ...followupdata,
      ...warmdata,
      ...wondata,
      ...deaddata,
    ];

    res.status(200).json({
      message: "All BD Leads",
      leads: allLeads,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getLeadSummary = async (req, res) => {
  try {
    // Step 1: Lead Aggregation
    const leadAggregation = await createbdleads.aggregate([
      {
        $group: {
          _id: "$source",
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$count" }
        }
      },
      {
        $project: {
          _id: 0,
          totalLeads: "$total"
        }
      }
    ]);

    const totalLeads = leadAggregation[0]?.totalLeads || 0;

    // Step 2: Count Handovers and Calculate Conversion Rate
    const totalHandovers = await handoversheet.countDocuments();
    const conversionRate = totalLeads > 0 ? ((totalHandovers / totalLeads) * 100).toFixed(2) : "0.00";

    // Step 3: Count Assigned Tasks
    const totalTasks = await task.countDocuments();

    // Final Response
    res.json({
      total_leads: totalLeads,
      conversion_rate_percentage: +conversionRate,
      assigned_tasks: totalTasks
    });

  } catch (error) {
    console.error("Lead Summary Error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

//Lead source summary
const getLeadSource = async (req, res) => {
  try {
    const leadAggregation = await createbdleads.aggregate([
      {
        $group: {
          _id: "$source",
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$count" },
          sources: {
            $push: {
              source: "$_id",
              count: "$count"
            }
          }
        }
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
                    2
                  ]
                }
              }
            }
          }
        }
      }
    ]);

    const sourceList = leadAggregation[0]?.sources || [];

    const normalizedSources = {};
    sourceList.forEach(item => {
      const key = item.source?.toLowerCase()?.trim() || "others";
      if (!normalizedSources[key]) normalizedSources[key] = 0;
      normalizedSources[key] += item.percentage;
    });

    const leadSourceSummary = [
      { source: "Social Media", percentage: +(normalizedSources["social media"]?.toFixed(2) || 0) },
      { source: "Marketing", percentage: +(normalizedSources["marketing"]?.toFixed(2) || 0) },
      { source: "IVR/My Operator", percentage: +(normalizedSources["ivr/my operator"]?.toFixed(2) || 0) },
      { source: "Others", percentage: +(normalizedSources["others"]?.toFixed(2) || 0) }
    ];

    res.json({ lead_sources: leadSourceSummary });

  } catch (error) {
    console.error("Lead Source Summary Error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


//task dashboard 
const taskDashboard = async (req, res) => {
  try {
    const taskData = await task.find();

    const taskDashboard = {};

    taskData.forEach(t => {
      if (!t.by_whom) return;

      const people = t.by_whom.split(",").map(p => p.trim());

      people.forEach(person => {
        if (!taskDashboard[person]) {
          taskDashboard[person] = {
            name: person,
            assigned_tasks: 0,
            task_completed: 0
          };
        }

        taskDashboard[person].assigned_tasks += 1;

        if (t.comment && t.comment.trim() !== "") {
          taskDashboard[person].task_completed += 1;
        }
      });
    });

    const taskDashboardArray = Object.values(taskDashboard);

    res.json({ task_dashboard: taskDashboardArray });

  } catch (error) {
    console.error("Task Dashboard Error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
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
      "today": "day",
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
    const [
      initialLeadAgg,
      followupAgg,
      warmLeadAgg,
      wonLeadAgg,
      deadLeadAgg,
    ] = await Promise.all([
      initiallead.aggregate([{ $match: dateFilter }, { $count: "count" }]),
      followUpBdleadModells.aggregate([{ $match: dateFilter }, { $count: "count" }]),
      warmbdLeadModells.aggregate([{ $match: dateFilter }, { $count: "count" }]),
      wonleadModells.aggregate([{ $match: dateFilter }, { $count: "count" }]),
      deadleadModells.aggregate([{ $match: dateFilter }, { $count: "count" }]),
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
      "today": "day",
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
      totalLeads > 0 ? ((totalHandovers / totalLeads) * 100).toFixed(2) : "0.00";

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

// Get Lead by LeadId or id
const getLeadByLeadIdorId = async (req, res) => {
  try {
    const { leadId, id, status } = req.query;

    if (!id && !leadId) {
      return res.status(400).json({
        message: "Lead Id or id not found"
      });
    }

    let query = {};
    if (id) query._id = id;
    if (leadId) query.id = leadId;

    const modelMap = {
      won: wonleadModells,
      followUp: followUpBdleadModells,
      warm: warmbdLeadModells,
      dead: deadleadModells,
      initial: initiallead, 
    };

    const model = status ? modelMap[status] : initiallead;

    if (!model) {
      return res.status(400).json({
        message: "Invalid status"
      });
    }
    console.log(model);
    const response = await model.findOne(query);

    res.status(200).json({
      message: "Lead Information retrieved successfully",
      data: response
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message
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
      "today": "day",
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
      if (showCapacity) result[name].capacity = parseFloat(totalCapacity.toFixed(2));
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

//lead won and lead lost graph
const leadWonAndLost = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;

    let fromDate, toDate;
    const now = new Date();

    const rangeKeyMap = {
      "today": "day",
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

    const dateFilter = fromDate && toDate
      ? { createdAt: { $gte: fromDate, $lte: toDate } }
      : {};

    // Model Map
    const modelMap = {
      won: wonleadModells,
      followUp: followUpBdleadModells,
      warm: warmbdLeadModells,
      dead: deadleadModells,
      initial: initiallead,
    };

    // Count documents from each model with date filter
    const [
      wonCount,
      followUpCount,
      warmCount,
      deadCount,
      initialCount
    ] = await Promise.all([
      modelMap.won.countDocuments(dateFilter),
      modelMap.followUp.countDocuments(dateFilter),
      modelMap.warm.countDocuments(dateFilter),
      modelMap.dead.countDocuments(dateFilter),
      modelMap.initial.countDocuments(dateFilter),
    ]);

    const totalLeads = wonCount + followUpCount + warmCount + deadCount + initialCount;
    const activeLeads = wonCount + followUpCount + warmCount + initialCount;
    const lostLeads = deadCount;

    const lostPercentage = totalLeads > 0 ? ((lostLeads / totalLeads) * 100).toFixed(2) : "0.00";
    const wonPercentage = totalLeads > 0 ? ((wonCount / totalLeads) * 100).toFixed(2) : "0.00";

    const [totalHandovers, totalTasks] = await Promise.all([
      handoversheet.countDocuments(dateFilter),
      task.countDocuments()
    ]);

    const conversionRate = totalLeads > 0 ? ((totalHandovers / totalLeads) * 100).toFixed(2) : "0.00";

    // ---------------- Monthly Data Calculation -----------------

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Aggregation for all models
    const aggregateAll = async (model) => {
      return model.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
      ]);
    };

    const [
      aggWon,
      aggFollowUp,
      aggWarm,
      aggDead,
      aggInitial
    ] = await Promise.all([
      aggregateAll(modelMap.won),
      aggregateAll(modelMap.followUp),
      aggregateAll(modelMap.warm),
      aggregateAll(modelMap.dead),
      aggregateAll(modelMap.initial),
    ]);

    // Combine data
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

    // Prepare final monthly data
    const monthlyData = Object.values(monthlyDataMap).map((item) => {
      const wonPercentage = item.total > 0 ? ((item.won / item.total) * 100).toFixed(2) : "0.00";
      const lostPercentage = item.total > 0 ? ((item.lost / item.total) * 100).toFixed(2) : "0.00";

      return {
        month: item.month,
        won_percentage: +wonPercentage,
        lost_percentage: +lostPercentage,
      };
    });

    // Sort by year and month
    monthlyData.sort((a, b) => {
      const monthIndexA = monthNames.indexOf(a.month);
      const monthIndexB = monthNames.indexOf(b.month);
      return monthIndexA - monthIndexB;
    });

    // ---------------- Final Response -----------------

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
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};



module.exports= {
    getAllLeads,
    getAllLeadDropdown,
    getLeadSummary,
    getLeadSource,
    taskDashboard,
    leadSummary,
    leadconversationrate,
    getLeadByLeadIdorId,
    leadFunnel,
    leadWonAndLost
};
