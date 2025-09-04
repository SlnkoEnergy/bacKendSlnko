const TaskCounterSchema = require("../models/taskcounter.model");
const tasksModells = require("../models/task.model");
const User = require("../models/user.model");
const { Parser } = require("json2csv");

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
      return res.status(401).json({ message: "Unauthorized: Invalid user." });
    }

    const userRole = currentUser.role.toLowerCase();

    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      createdAt = "",
      deadline = "",
      department = "",
      assignedToName = "",
      createdByName = "",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const searchRegex = new RegExp(search, "i");
    const assignedToNameRegex = assignedToName ? new RegExp(assignedToName, "i") : null;
    const createdByNameRegex = createdByName ? new RegExp(createdByName, "i") : null;

    const preLookupMatch = [];

    if (
      currentUser.emp_id === "SE-013" ||
      userRole === "admin" ||
      userRole === "superadmin"
    ) {
      // see everything
    } else if (userRole === "manager") {
      const dept = currentUser.department;
      if (!dept) {
        return res.status(400).json({ message: "Manager department not found." });
      }

      const departmentUsers = await User.find({ department: dept }, "_id");
      const deptUserIds = departmentUsers.map((u) => u._id);

      preLookupMatch.push({
        $or: [
          { assigned_to: { $in: deptUserIds } },
          { createdBy: { $in: deptUserIds } },
        ],
      });
    } else if (userRole === "visitor") {
      const projCamUsers = await User.find(
        { department: { $in: ["Projects", "CAM"] } },
        "_id"
      );
      const projCamUserIds = projCamUsers.map((u) => u._id);

      preLookupMatch.push({
        $or: [
          { assigned_to: { $in: projCamUserIds } },
          { createdBy: { $in: projCamUserIds } },
        ],
      });
    } else {
      preLookupMatch.push({
        $or: [{ assigned_to: currentUser._id }, { createdBy: currentUser._id }],
      });
    }

    const basePipeline = [];

    if (preLookupMatch.length > 0) {
      basePipeline.push({ $match: { $and: preLookupMatch } });
    }

    // Lookups
    basePipeline.push(
      {
        $lookup: {
          from: "projectdetails",
          localField: "project_id",
          foreignField: "_id",
          as: "project_details",
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
          as: "createdBy_info",
        },
      },
      {
        $unwind: {
          path: "$createdBy_info",
          preserveNullAndEmptyArrays: true,
        },
      }
    );

    const postLookupMatch = [];

    // Hide statuses
    const hideStatuses = [];
    if (req.query.hide_completed === "true") hideStatuses.push("completed");
    if (req.query.hide_pending === "true") hideStatuses.push("pending");
    if (req.query.hide_inprogress === "true") hideStatuses.push("in progress");
    if (hideStatuses.length > 0) {
      postLookupMatch.push({ "current_status.status": { $nin: hideStatuses } });
    }

    // Text search
    if (search) {
      postLookupMatch.push({
        $or: [
          { title: searchRegex },
          { description: searchRegex },
          { taskCode: searchRegex },
          { "project_details.code": searchRegex },
          { "project_details.name": searchRegex },
          { type: searchRegex },
          { sub_type: searchRegex },
        ],
      });
    }

    // Status filter
    if (status) {
      postLookupMatch.push({ "current_status.status": status });
    }

    // CreatedAt (single-day window)
    if (createdAt) {
      const start = new Date(createdAt);
      const end = new Date(createdAt);
      end.setDate(end.getDate() + 1);
      postLookupMatch.push({ createdAt: { $gte: start, $lt: end } });
    }

    // Deadline (single-day window)
    if (deadline) {
      const start = new Date(deadline);
      const end = new Date(deadline);
      end.setDate(end.getDate() + 1);
      postLookupMatch.push({ deadline: { $gte: start, $lt: end } });
    }

    // Department (on any assignee's department)
    if (department) {
      postLookupMatch.push({ "assigned_to.department": department });
    }

    // NEW: Filter by assignee name (any team member in assigned_to)
    if (assignedToNameRegex) {
      postLookupMatch.push({
        assigned_to: {
          $elemMatch: { name: assignedToNameRegex },
        },
      });
    }

    // NEW: Filter by creator name
    if (createdByNameRegex) {
      postLookupMatch.push({
        "createdBy_info.name": createdByNameRegex,
      });
    }

    if (postLookupMatch.length > 0) {
      basePipeline.push({ $match: { $and: postLookupMatch } });
    }

    const dataPipeline = [
      ...basePipeline,
      {
        $project: {
          _id: 1,
          title: 1,
          taskCode: 1,
          type: 1,
          sub_type: 1,
          description: 1,
          createdAt: 1,
          deadline: 1,
          priority: 1,
          status_history: 1,
          current_status: 1,
          project_details: {
            $map: {
              input: "$project_details",
              as: "proj",
              in: {
                _id: "$$proj._id",
                code: "$$proj.code",
                name: "$$proj.name",
              },
            },
          },
          assigned_to: {
            $map: {
              input: "$assigned_to",
              as: "user",
              in: {
                _id: "$$user._id",
                name: "$$user.name",
                department: "$$user.department",
              },
            },
          },
          createdBy: {
            _id: "$createdBy_info._id",
            name: "$createdBy_info.name",
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
    ];

    const countPipeline = [...basePipeline, { $count: "totalCount" }];

    const [tasks, countResult] = await Promise.all([
      tasksModells.aggregate(dataPipeline),
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

const exportToCsv = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No task IDs provided." });
    }

    const tasks = await tasksModells
      .find({ _id: { $in: ids } })
      .populate("project_id", "code name")
      .populate("assigned_to", "name")
      .populate("createdBy", "name")
      .populate("current_status.user_id", "name")
      .populate("status_history.user_id", "name");

    const formattedTasks = tasks.map((task) => {
      const statusHistory = task.status_history
        .map(
          (entry) =>
            `[${entry.status}] by ${entry.user_id?.name || "N/A"} on ${new Date(entry.updatedAt).toLocaleDateString("en-GB")} (${entry.remarks || "-"})`
        )
        .join(" | ");

      return {
        TaskCode: task.taskCode,
        Title: task.title,
        Type: task.type,
        SubType: task.sub_type,
        Description: task.description,
        Deadline: task.deadline
          ? new Date(task.deadline).toLocaleDateString("en-GB")
          : "N/A",
        Project: task.project_id?.[0]?.name || "N/A",
        "Project Code": task.project_id?.[0]?.code || "N/A",
         AssignedTo:
          task.assigned_to?.map((user) => user.name).join(", ") || "N/A",
        Priority: task.priority,
        StatusHistory: statusHistory || "N/A",
        CurrentStatus: task.current_status?.status || "N/A",
        CurrentStatusRemarks: task.current_status?.remarks || "N/A",
        CurrentStatusBy: task.current_status?.user_id?.name || "N/A",
        CreatedBy: task.createdBy?.name || "N/A",
        CreatedAt: task.createdAt
          ? new Date(task.createdAt).toLocaleDateString("en-GB")
          : "N/A",
      };
    });

    const parser = new Parser();
    const csv = parser.parse(formattedTasks);

    res.header("Content-Type", "text/csv");
    res.attachment("tasks_export.csv");
    return res.send(csv);
  } catch (error) {
    console.error("CSV Export Error:", error);
    return res.status(500).json({ message: "Error exporting tasks to CSV" });
  }
};

module.exports = {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  updateTaskStatus,
  exportToCsv,
};
