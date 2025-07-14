const tasksModells = require("../../Modells/tasks/task");
const userModells = require("../../Modells/userModells");

// Create a new task
const createTask = async (req, res) => {
  try {
    const { team } = req.query;
    let assignedUserIds = req.body.assigned_to || [];

    if (team) {
      const users = await userModells.find({ department: team }, "_id");
      const teamUserIds = users.map((user) => user._id.toString());
      assignedUserIds = [...assignedUserIds, ...teamUserIds];
    }

    assignedUserIds = [...new Set(assignedUserIds)];

    const task = new tasksModells({
      ...req.body,
      assigned_to: assignedUserIds,
      createdBy: req.user.userId
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
    const tasks = await tasksModells
      .find()
      .populate("assigned_to")
      .populate("createdBy");
    res.status(200).json(tasks);
  } catch (err) {
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
