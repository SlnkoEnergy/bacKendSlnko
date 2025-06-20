const initiallead =require("../Modells/initialBdLeadModells");
const followuplead = require("../Modells/followupbdModells");
const warmlead =require("../Modells/warmbdLeadModells");
const wonlead =require("../Modells/wonleadModells");
const deadlead = require("../Modells/deadleadModells");
const task =require("../Modells/addtaskbdModells");
const createbdleads =require("../Modells/createBDleadModells");
const handoversheet =require("../Modells/handoversheetModells");
const initialBdLeadModells = require("../Modells/initialBdLeadModells");
const warmbdLeadModells = require("../Modells/warmbdLeadModells");
const wonleadModells = require("../Modells/wonleadModells");
const deadleadModells = require("../Modells/deadleadModells");
const followUpBdleadModells = require("../Modells/followupbdModells");


const bddashboard = async function (req, res) {
   try {
    // 1. Lead Aggregation
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
          totalLeads: "$total",
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

    const totalLeads = leadAggregation[0]?.totalLeads || 0;
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

    // 2. Assigned Tasks (total)
    const totalTasks = await task.countDocuments();

    // 3. Handovers
    const totalHandovers = await handoversheet.countDocuments();
    const conversionRate = totalLeads > 0 ? ((totalHandovers / totalLeads) * 100).toFixed(2) : 0;

    // 4. Lead Status Counts
    const [initialLeadAgg, followupAgg, warmLeadAgg, wonLeadAgg, deadLeadAgg] = await Promise.all([
      initiallead.aggregate([{ $count: "count" }]),
      followuplead.aggregate([{ $count: "count" }]),
      warmlead.aggregate([{ $count: "count" }]),
      wonlead.aggregate([{ $count: "count" }]),
      deadlead.aggregate([{ $count: "count" }])
    ]);

    const leadStatusSummary = {
      initial_leads: initialLeadAgg[0]?.count || 0,
      followup_leads: followupAgg[0]?.count || 0,
      warm_leads: warmLeadAgg[0]?.count || 0,
      won_leads: wonLeadAgg[0]?.count || 0,
      dead_leads: deadLeadAgg[0]?.count || 0
    };

    // 5. Task Dashboard by `by_whom`
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

    // Final Response
    res.json({
      total_leads: totalLeads,
      assigned_tasks: totalTasks,
      conversion_rate_percentage: +conversionRate,
      lead_sources: leadSourceSummary,
      lead_status_summary: leadStatusSummary,
      task_dashboard: taskDashboardArray
    });

  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).send({ message: "Internal server error", error: error.message });
  }
};

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
      ],
    };

    const stageModelMap = {
      initial: initialBdLeadModells,
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



module.exports= {
    bddashboard,
    getAllLeads
};
