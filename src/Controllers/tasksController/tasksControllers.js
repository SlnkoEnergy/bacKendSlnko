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
      const users = await User.find({ department: team }, "_id");
      const teamUserIds = users.map((user) => user._id.toString());
      assignedUserIds = [...assignedUserIds, ...teamUserIds];
    }

    assignedUserIds = [...new Set(assignedUserIds)];

    const counter = await TaskCounterSchema.findOneAndUpdate(
      { createdBy: userId },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );

    const taskCode = `T/${deptCode}/${String(counter.count).padStart(3, "0")}`;

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
      return res
        .status(401)
        .json({ message: "Unauthorized: Invalid token or user info" });
    }

    const userId = currentUser._id;
    const userRole = currentUser.role.toLowerCase();

    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      createdAt = "",
      department = "", 
    } = req.query;

    const skip = (page - 1) * limit;
    const searchRegex = new RegExp(search, "i");

    const matchConditions = [];

    // Role-based access
    if (userRole !== "admin" && userRole !== "superadmin") {
      matchConditions.push({
        $or: [
          { assigned_to: { $elemMatch: { _id: userId } } },
          { createdBy: userId },
        ],
      });
    }

    // Search condition
    if (search) {
      matchConditions.push({
        $or: [
          { title: searchRegex },
          { description: searchRegex },
          { taskCode: searchRegex },
          { "project_id.code": searchRegex },
          { "project_id.name": searchRegex },
        ],
      });
    }

    // Status condition
    if (status) {
      matchConditions.push({
        "current_status.status": status,
      });
    }

    // Created Date filter
    if (createdAt) {
      const start = new Date(createdAt);
      const end = new Date(createdAt);
      end.setDate(end.getDate() + 1);

      matchConditions.push({
        createdAt: {
          $gte: start,
          $lt: end,
        },
      });
    }

    // ✅ Department filter on assigned_to array
    if (department) {
      matchConditions.push({
        assigned_to: {
          $elemMatch: {
            department: department,
          },
        },
      });
    }

    // Build aggregation pipeline
    const pipeline = [
      {
        $lookup: {
          from: "projectdetails",
          localField: "project_id",
          foreignField: "_id",
          as: "project_id",
        },
      },
      {
        $unwind: {
          path: "$project_id",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy",
        },
      },
      {
        $unwind: {
          path: "$createdBy",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    // Apply all match conditions
    if (matchConditions.length > 0) {
      pipeline.push({
        $match: {
          $and: matchConditions,
        },
      });
    }

    pipeline.push(
      {
        $project: {
          _id: 1,
          title: 1,
          taskCode: 1,
          description: 1,
          createdAt: 1,
          deadline: 1,
          priority: 1,
          current_status: 1,
          project_id: {
            _id: 1,
            code: 1,
            name: 1,
          },
          assigned_to: {
            _id: 1,
            name: 1,
            department: 1, // ✅ include department in output
          },
          createdBy: {
            _id: 1,
            name: 1,
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) }
    );

    // Count pipeline (exclude skip, limit, sort)
    const countPipeline = [
      ...pipeline.slice(0, -3),
      { $count: "totalCount" },
    ];

    const [tasks, countResult] = await Promise.all([
      tasksModells.aggregate(pipeline),
      tasksModells.aggregate(countPipeline),
    ]);

    const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

    res.status(200).json({
      totalTasks: totalCount,
      page: Number(page),
      totalPages: Math.ceil(totalCount / limit),
      tasks,
    });
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
};


// Get a task by ID
const getTaskById = async (req, res) => {
  try {
    const task = await tasksModells
      .findById(req.params.id)
      .populate("assigned_to", "_id name")
      .populate("createdBy", "_id name")
      .populate("project_id", "code name")
      .populate("current_status.user_id", "_id name")
      .populate("status_history.user_id", "_id name");
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

const updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!id) {
      return res.status(404).json({
        message: "ID Not Found",
      });
    }
    if (!status) {
      return res.status(404).json({
        message: "Status is required",
      });
    }
    const task = await tasksModells.findById(id);
    if (!task) {
      return res.status(404).json({
        message: "Task Not Found",
      });
    }
    task.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
    });
    await task.save();
    res.status(200).json({
      message: "Task Updated Successfully",
      data: task,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
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
  updateTaskStatus,
};
