const TaskCounterSchema = require("../../Modells/Globals/taskCounter");
const tasksModells = require("../../Modells/tasks/task");
const User = require("../../Modells/userModells");


const createTask = async (req, res) => {
  try {
    const { team } = req.query;
    let assignedUserIds = req.body.assigned_to || [];

    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const deptCode = user.department?.substring(0, 3).toUpperCase() || "GEN"; 

    if (team) {
      const users = await userModells.find({ department: team }, "_id");
      const teamUserIds = users.map((user) => user._id.toString());
      assignedUserIds = [...assignedUserIds, ...teamUserIds];
    }

    assignedUserIds = [...new Set(assignedUserIds)];

    const counter = await TaskCounterSchema.findOneAndUpdate(
      { createdBy: userId },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );

    const taskCode = `T/${deptCode}/${String(counter.count).padStart(3, "0")}`; // T/INT/001

    const task = new tasksModells({
      ...req.body,
      assigned_to: assignedUserIds,
      createdBy: userId,
      taskCode,
    });

    const saved = await task.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};



//get all tasks
const getAllTasks = async (req, res) => {
   try {
    const currentUser = await User.findById(req.user.userId);

    if (!currentUser || !currentUser._id || !currentUser.role) {
      return res.status(401).json({ message: "Unauthorized: Invalid token or user info" });
    }

    const userId = currentUser._id;
    const userRole = currentUser.role.toLowerCase();

    // Extract page and limit from query, with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query;
    if (userRole === "admin" || userRole === "superadmin") {
      query = {};
    } else {
      query = {
        $or: [
          { assigned_to: userId },
          { createdBy: userId }
        ]
      };
    }

    const totalTasks = await tasksModells.countDocuments(query);
    const tasks = await tasksModells.find(query)
      .skip(skip)
      .limit(limit)
         .populate({
        path: "assigned_to",
        select: "_id name"
      })
      .populate({
        path: "createdBy",
        select: "_id name"
      })
      .populate({
        path: "project_id",
        select: "_id code name"
      });

    res.status(200).json({
      totalTasks,
      page,
      totalPages: Math.ceil(totalTasks / limit),
      tasks
    });
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(400).json({ error: err.message });
  }
};

// Get a task by ID
const getTaskById = async (req, res) => {
  try {
    const task = await tasksModells
      .findById(req.params.id)
      .populate("assigned_to")
      .populate("createdBy");
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.status(200).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Update a task
const updateTask = async (req, res) => {
  try {
    const task = await tasksModells
      .findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate("assigned_to")
      .populate("createdBy");
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.status(200).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete a task
const deleteTask = async (req, res) => {
  try {
    const task = await tasksModells.findByIdAndDelete(req.params.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.status(200).json({ message: "Task deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
};
