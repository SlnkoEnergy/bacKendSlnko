const Initial = require("../../Modells/initialBdLeadModells");
const Followup = require("../../Modells/followupbdModells");
const Warm = require("../../Modells/warmbdLeadModells");
const Won = require("../../Modells/wonleadModells");
const Dead = require("../../Modells/deadleadModells");
const BDtask = require("../../Modells/BD-Dashboard/task");
const userModells = require("../../Modells/userModells");
const transformAndSaveOldLead = require("../../utils/bdLeadTransform");
const deadleadModells = require("../../Modells/deadleadModells");

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
      status_history: [
        {
          status: status || "draft",
          user_id,
        },
      ],
    });

    await newTask.save();

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
      remarks
    });

    await task.save();

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
    const { type } = req.query;

    const user = await userModells.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isPrivilegedUser =
      user.department === "admin" || (user.department === "BD" && user.role === "manager");

    const matchQuery = {};

    if (!isPrivilegedUser) {
      matchQuery.$or = [
        { assigned_to: { $in: [userId] } },
        { user_id: userId },
      ];
    }

    if (type) {
      matchQuery.type = type;
    }

    const tasks = await BDtask.find(matchQuery)
      .select("title priority _id lead_id type current_status assigned_to deadline updatedAt user_id")
      .populate({
        path: "assigned_to",
        select: "_id name",
      })
      .populate({
        path: "user_id",
        select: "name",
      });

    const populatedTasks = await Promise.all(
      tasks.map(async (taskDoc) => {
        const task = taskDoc.toObject();

        if (task.lead_id) {
          const leadDoc = await bdleadsModells.findById(task.lead_id).select("_id c_name id capacity");
          if (leadDoc) {
            task.lead_id = {
              _id: leadDoc._id,
              c_name: leadDoc.c_name,
              id: leadDoc.id,
              capacity: leadDoc.capacity,
            };
          }
        }

        return task;
      })
    );

    return res.status(200).json({ success: true, data: populatedTasks });
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
      const leadDoc = await bdleadsModells.findById(task.lead_id).select("_id c_name id capacity");
      if (leadDoc) {
        task.lead_id = {
          _id: leadDoc._id,
          c_name: leadDoc.c_name,
          id: leadDoc.id,
          capacity: leadDoc.capacity,
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

    return res.status(200).json({ message: "Marked as viewed", is_viewed: task.is_viewed });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


const getNotifications = async (req, res) => {
  const userId = req.user.userId;

  try {
    const notifications = await BDtask.find({
      assigned_to: userId,
      is_viewed: { $ne: userId } 
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
        console.error(`❌ Error migrating lead with ID ${oldLead.id}:`, err.message);
      }
    }

    res.status(200).json({
      message: "Migration completed",
      successCount,
      failureCount,
      total: oldLeads.length
    });
  } catch (error) {
    console.error("Migration failed:", error);
    res.status(500).json({ message: "Migration failed", error: error.message });
  }
};


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
  migrateAllLeads
};
