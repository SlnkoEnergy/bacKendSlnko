const BDtask = require("../../Modells/bdleads/task");
const userModells = require("../../Modells/users/userModells");
const transformAndSaveOldLead = require("../../utils/bdLeadTransform");
const deadleadModells = require("../../Modells/deadleadModells");
const bdleadsModells = require("../../Modells/bdleads/bdleadsModells");
const { default: mongoose } = require("mongoose");
const { Parser } = require("json2csv");
const { getNotification, getnovuNotification } = require("../../utils/nouvnotificationutils");

const createTask = async (req, res) => {
  try {
    const {
      title,
      lead_id,
      user_id,
      type,
      status,
      assigned_to,
      deadline,
      contact_info,
      priority,
      description,
    } = req.body;

    // Check lead existence in single model
    const lead = await bdleadsModells.findById(lead_id);
    if (!lead) {
      return res.status(400).json({ error: "Invalid lead_id" });
    }
    
    const newTask = new BDtask({
      title,
      lead_id,
      user_id,
      type,
      assigned_to,
      deadline,
      contact_info,
      priority,
      description,
    });

    lead.inactivedate = Date.now();
    await lead.save();

    await newTask.save();

    // Notification functionality for Creating Task
    console.log(assigned_to);
    try {
      const workflow = 'task-create';
      const senders = assigned_to;
      const data  = {
        message : ` New Task is created`,
        link:`leadProfile?id=${lead._id}`
      }
      await getnovuNotification(workflow, senders, data);

    } catch (error) {
      console.log(error);
    }

    res.status(201).json({
      message: "Task created successfully",
      task: newTask,
    });
  } catch (error) {
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message,
    });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { _id } = req.params;
    const { status, remarks, user_id } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const task = await BDtask.findById(_id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    task.status_history.push({
      status,
      user_id,
      remarks,
    });
    
    const lead = await bdleadsModells.findById(task.lead_id);
    lead.inactivedate = Date.now();
    await lead.save();

    await task.save();

    // Notification on Task status change

    try {
      const workflow = 'task-status';
      const senders = [task?.user_id];
      const data = {
        message : `Update Status : ${status} of Lead Id ${lead?.id} and Task Name ${task.title}`,
        link:`leadProfile?id=${lead._id}`
      }
      await getnovuNotification(workflow, senders, data);
    } catch (error) {
      console.log(error);
    }

    res.status(200).json({
      message: "Task status updated successfully",
      data: task,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getAllTask = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      status,
      page = 1,
      limit = 10,
      search = "",
      fromDeadline,
      toDeadline,
    } = req.query;

    const user = await userModells.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isPrivilegedUser =
      user.department === "admin" ||
      user.department === "superadmin" ||
      (user.department === "BD" && user.role === "manager");

    const matchQuery = {};

   if (!isPrivilegedUser) {
  matchQuery.$or = [
    { user_id: new mongoose.Types.ObjectId(userId) },
    { assigned_to: new mongoose.Types.ObjectId(userId) },
  ];
}

    if (status) {
      matchQuery["current_status"] = status;
    }

    if (fromDeadline || toDeadline) {
      matchQuery.deadline = {};
      if (fromDeadline) matchQuery.deadline.$gte = new Date(fromDeadline);
      if (toDeadline) matchQuery.deadline.$lte = new Date(toDeadline);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const pipeline = [
      { $match: matchQuery },

      // Lookup lead
      {
        $lookup: {
          from: "bdleads",
          localField: "lead_id",
          foreignField: "_id",
          as: "lead",
        },
      },
      { $unwind: { path: "$lead", preserveNullAndEmptyArrays: true } },

      // Lookup assigned users (array)
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to",
        },
      },

      // Optional search
    ];

    if (search) {
      const searchRegex = new RegExp(search, "i");
      pipeline.push({
        $match: {
          $or: [
            { title: { $regex: searchRegex } },
            { type: { $regex: searchRegex } },
            { "lead.name": { $regex: searchRegex } },
            { "lead.id": { $regex: searchRegex } },
            { "assigned_to.name": { $regex: searchRegex } },
          ],
        },
      });
    }

    // Count total
    const totalPipeline = [...pipeline, { $count: "total" }];
    const totalResult = await BDtask.aggregate(totalPipeline);
    const total = totalResult[0]?.total || 0;

    // Pagination & Sorting
    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: Number(limit) });

    // Final projection
    pipeline.push({
      $project: {
        _id: 1,
        title: 1,
        type: 1,
        priority: 1,
        deadline: 1,
        updatedAt: 1,
        current_status: 1,
        user_id: 1,
        assigned_to: { _id: 1, name: 1 },
        lead: { _id: 1, name: 1, id: 1 },
      },
    });

    const tasks = await BDtask.aggregate(pipeline);

    // Populate user_id separately
    const populatedTasks = await BDtask.populate(tasks, [
      { path: "user_id", select: "_id name" },
    ]);

    return res.status(200).json({
      success: true,
      data: populatedTasks,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getAllTaskByAssigned = async (req, res) => {
  try {
    const userId = req.user.userId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const tasks = await BDtask.find({
      assigned_to: userId,
      deadline: {
        $gte: today,
        $lt: tomorrow,
      },
    }).populate("user_id", "_id name");

    res.status(200).json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error", error });
  }
};

const getTaskById = async (req, res) => {
  try {
    const taskDoc = await BDtask.findById(req.params._id)
      .populate("user_id", "_id name")
      .populate("assigned_to", "_id name")
      .populate("status_history.user_id", "_id name");

    if (!taskDoc) {
      return res.status(404).json({
        message: "Task not found for this id",
      });
    }

    const task = taskDoc.toObject();

    if (task.lead_id) {
      const leadDoc = await bdleadsModells
        .findById(task.lead_id)
        .select("_id name id");
      if (leadDoc) {
        task.lead_id = {
          _id: leadDoc._id,
          name: leadDoc.name,
          id: leadDoc.id,
        };
      }
    }

    res.status(200).json({
      message: "Task for this id found successfully",
      data: task,
    });
  } catch (error) {
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message,
    });
  }
};

const getTaskByLeadId = async (req, res) => {
  try {
    const { leadId } = req.query;
    if (!leadId) {
      return res.status(404).json({
        message: "id or LeadId not found",
      });
    }
    const query = { lead_id: leadId };

    const data = await BDtask.find(query)
      .populate("user_id", "name")
      .populate("assigned_to", "name")
      .populate("status_history.user_id", "name");

    res.status(200).json({
      message: "Task detail fetched successfully",
      data: data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateTask = async (req, res) => {
  try {
    const response = await BDtask.findByIdAndUpdate(req.params._id, req.body, {
      new: true,
    });
    const lead = await bdleadsModells.findById(response.lead_id);
    lead.inactivedate = Date.now();
    await lead.save();
    res.status(201).json({
      message: "Task Updated Successfully",
      data: response,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const response = await BDtask.findByIdAndDelete(req.params._id);
    res.status(200).json({
      message: "Task Deleted Successfully",
      data: response,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
};

const toggleViewTask = async (req, res) => {
  const { _id } = req.params;
  const userId = req.user.userId;

  try {
    const task = await BDtask.findById(_id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    if (!task.is_viewed.includes(userId)) {
      task.is_viewed.push(userId);
      await task.save();
    }

    return res
      .status(200)
      .json({ message: "Marked as viewed", is_viewed: task.is_viewed });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const getNotifications = async (req, res) => {
  const userId = req.user.userId;

  try {
    const notifications = await BDtask.find({
      assigned_to: userId,
      is_viewed: { $ne: userId },
    })
      .sort({ createdAt: -1 })
      .select("title description createdAt");

    const formatted = notifications.map((task) => ({
      _id: task._id,
      title: task.title,
      description: task.description,
      time: task.createdAt.toLocaleString(),
    }));

    res.status(200).json(formatted);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const migrateAllLeads = async (req, res) => {
  try {
    const oldLeads = await deadleadModells.find();
    let successCount = 0;
    let failureCount = 0;

    for (const oldLead of oldLeads) {
      try {
        await transformAndSaveOldLead(oldLead);
        successCount++;
        console.log(`✅ Migrated lead with ID: ${oldLead.id}`);
      } catch (err) {
        failureCount++;
        console.error(
          `❌ Error migrating lead with ID ${oldLead.id}:`,
          err.message
        );
      }
    }

    res.status(200).json({
      message: "Migration completed",
      successCount,
      failureCount,
      total: oldLeads.length,
    });
  } catch (error) {
    console.error("Migration failed:", error);
    res.status(500).json({ message: "Migration failed", error: error.message });
  }
};

const getexportToCsv = async (req, res) => {
  try {
    const { Ids } = req.body;

  const pipeline = [
    {
      $match: {
        _id: { $in: Ids.map((id) => new mongoose.Types.ObjectId(id)) },
      },
    },
    {
      $lookup: {
        from: "bdleads",
        localField: "lead_id",
        foreignField: "_id",
        as: "lead",
      },
    },
    { $unwind: { path: "$lead", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "assigned_to",
        foreignField: "_id",
        as: "assigned_to",
      },
    },
    { $unwind: { path: "$assigned_to", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "created_by",
      },
    },
    { $unwind: { path: "$created_by", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        title: 1,
        type: 1,
        current_status: 1,
        priority: 1,
        deadline: 1,
        description: 1,
        lead_name: "$lead.name",
        created_By: "$created_by.name",
        assigned_to_names: "$assigned_to.name",
      },
    },
  ];

  const result = await BDtask.aggregate(pipeline);

  const fields = [
    { label: 'Title', value: 'title' },
    { label: 'Type', value: 'type' },
    { label: 'Current Status', value: 'current_status' },
    { label: 'Priority', value: 'priority' },
    { label: 'Deadline', value: 'deadline' },
    { label: 'Lead Name', value: 'lead_name' },
    { label: 'Created By', value: 'created_By' },
    { label: 'Assigned Name', value: 'assigned_to_names' },
  ]

  const json2csvParser = new Parser({ fields });

  const csv = json2csvParser.parse(result);
  res.setHeader("Content-disposition", "attachment; filename=data.csv");
  res.set("Content-Type", "text/csv");
  res.status(200).send(csv);

  } catch (error) {
    res.status(500).json({
      message:"Internal Server Error",
      error: error.message
    })    
  }

}


module.exports = {
  createTask,
  getTaskById,
  updateTask,
  deleteTask,
  updateStatus,
  getAllTask,
  getTaskByLeadId,
  toggleViewTask,
  getNotifications,
  getAllTaskByAssigned,
  migrateAllLeads,
  getexportToCsv,
};
