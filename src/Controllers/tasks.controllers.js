const TaskCounterSchema = require("../models/taskcounter.model");
const tasksModells = require("../models/task.model");
const User = require("../models/user.model");
const { Parser } = require("json2csv");
const sanitizeHtml = require("sanitize-html");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");
const mime = require("mime-types");

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
      const teamUserIds = users.map((u) => u._id.toString());
      assignedUserIds = [...assignedUserIds, ...teamUserIds];
    }

    assignedUserIds = [...new Set(assignedUserIds.map((id) => id.toString()))];

    let followers = [...assignedUserIds];

    const managers = await User.find(
      { _id: { $in: assignedUserIds }, manager: { $exists: true } },
      "manager"
    ).populate("manager", "_id role");

    managers.forEach((m) => {
      if (m.manager && m.manager.role === "manager") {
        followers.push(m.manager._id.toString());
      }
    });

    followers = [...new Set(followers)];

    const counter = await TaskCounterSchema.findOneAndUpdate(
      { createdBy: userId },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );

    const taskCode = `T/${deptCode}/${String(counter.count).padStart(3, "0")}`;

    const task = new tasksModells({
      ...req.body,
      assigned_to: assignedUserIds,
      followers,
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
    const assignedToNameRegex = assignedToName
      ? new RegExp(assignedToName, "i")
      : null;
    const createdByNameRegex = createdByName
      ? new RegExp(createdByName, "i")
      : null;

    const preLookupMatch = [];
    if (
      currentUser.emp_id === "SE-013" ||
      userRole === "admin" ||
      userRole === "superadmin"
    ) {

    } else {

      preLookupMatch.push({
        $or: [
          { createdBy: currentUser._id },
          { followers: currentUser._id },
        ],
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

    // Filter by assignee name
    if (assignedToNameRegex) {
      postLookupMatch.push({
        assigned_to: {
          $elemMatch: { name: assignedToNameRegex },
        },
      });
    }

    // Filter by creator name
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
          followers: 1,
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
      .populate("status_history.user_id", "_id name")
      .populate("comments.user_id", "_id name")
      .populate("attachments.user_id", "_id name");
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.status(200).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

async function uploadFiles(files, folderPath) {
  const uploaded = [];

  for (const file of files || []) {
    const origMime =
      file.mimetype ||
      mime.lookup(file.originalname) ||
      "application/octet-stream";
    const origExt =
      mime.extension(origMime) ||
      (file.originalname.split(".").pop() || "").toLowerCase();

    let outBuffer = file.buffer;
    let outExt = origExt;
    let outMime = origMime;

    if (origMime.startsWith("image/")) {
      let target = ["jpeg", "jpg", "png", "webp"].includes(origExt)
        ? origExt
        : "jpeg";
      if (target === "jpg") target = "jpeg";

      if (target === "jpeg") {
        outBuffer = await sharp(outBuffer).jpeg({ quality: 40 }).toBuffer();
        outExt = "jpg";
        outMime = "image/jpeg";
      } else if (target === "png") {
        outBuffer = await sharp(outBuffer)
          .png({ compressionLevel: 9 })
          .toBuffer();
        outExt = "png";
        outMime = "image/png";
      } else if (target === "webp") {
        outBuffer = await sharp(outBuffer).webp({ quality: 40 }).toBuffer();
        outExt = "webp";
        outMime = "image/webp";
      }
    }

    const base = file.originalname.replace(/\.[^/.]+$/, "");
    const finalName = `${base}.${outExt}`;

    const form = new FormData();
    // If your external UPLOAD_API expects a different field name, change "file" here.
    form.append("file", outBuffer, {
      filename: finalName,
      contentType: outMime,
    });

    const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${encodeURIComponent(folderPath)}`;

    const resp = await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const data = resp.data;
    const url =
      Array.isArray(data) && data.length > 0
        ? data[0]
        : data.url || data.fileUrl || (data.data && data.data.url) || null;

    if (url) uploaded.push({ name: finalName, url });
    else console.warn(`No URL returned for ${finalName}`);
  }

  return uploaded;
}

const SANITIZE_CFG = {
  allowedTags: [
    "div",
    "p",
    "br",
    "span",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "ul",
    "ol",
    "li",
    "a",
    "blockquote",
    "code",
    "pre",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    span: ["style"],
    div: ["style"],
    p: ["style"],
  },
  allowedStyles: {
    "*": {
      color: [/^.*$/],
      "background-color": [/^.*$/],
      "text-decoration": [/^.*$/],
      "font-weight": [/^.*$/],
      "font-style": [/^.*$/],
    },
  },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName: "a",
      attribs: { ...attribs, rel: "noopener noreferrer", target: "_blank" },
    }),
  },
  textFilter: (text) => (text.length > 100000 ? text.slice(0, 100000) : text),
};

const updateTask = async (req, res) => {
  try {
    const id = req.params.id;

    const body =
      typeof req.body?.data === "string"
        ? JSON.parse(req.body.data)
        : req.body?.data
          ? req.body.data
          : req.body || {};

    const existing = await tasksModells.findById(id).select("taskCode assigned_to followers");
    if (!existing) return res.status(404).json({ error: "Task not found" });

    const userId = req.user?.userId || req.user?._id;

    const setFields = { ...body };
    delete setFields.comment;
    delete setFields.remarks;
    delete setFields.attachments;
    delete setFields.comments;
    delete setFields.data;
    delete setFields._id;
    delete setFields.createdAt;
    delete setFields.updatedAt;

    // Handle uploads (if any)
    let uploaded = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
      const safeTaskCode = existing.taskCode.replace(/[\/ ]/g, "_");
      const folderPath = `Tasks/${safeTaskCode}`;
      uploaded = await uploadFiles(req.files, folderPath);
    }

    // Build push operators
    const pushOps = {};
    const commentRaw = body.comment ?? body.remarks;

    if (commentRaw && String(commentRaw).trim()) {
      const cleanHtml = sanitizeHtml(String(commentRaw), SANITIZE_CFG);
      if (cleanHtml && cleanHtml.trim()) {
        pushOps.comments = {
          remarks: cleanHtml,
          user_id: userId || undefined,
          createdAt: new Date(),
        };
      }
    }

    if (uploaded.length) {
      const toAttach = uploaded.map((u) => ({
        name: u.name,
        url: u.url,
        user_id: userId || undefined,
      }));
      pushOps.attachments = { $each: toAttach };
    }

    // Followers update if assigned_to changed
    if (setFields.assigned_to) {
      const assignedArr = Array.isArray(setFields.assigned_to)
        ? setFields.assigned_to.map((id) => id.toString())
        : [setFields.assigned_to.toString()];

      const existingFollowers = existing.followers.map((f) => f.toString());
      const newFollowers = [...new Set([...existingFollowers, ...assignedArr])];

      setFields.followers = newFollowers;
    }

    const updateDoc = {};
    if (Object.keys(setFields).length) updateDoc.$set = setFields;

    if (pushOps.comments && pushOps.attachments) {
      updateDoc.$push = {
        comments: pushOps.comments,
        attachments: pushOps.attachments,
      };
    } else if (pushOps.comments) {
      updateDoc.$push = { comments: pushOps.comments };
    } else if (pushOps.attachments) {
      updateDoc.$push = { attachments: pushOps.attachments };
    }

    if (!updateDoc.$set && !updateDoc.$push) {
      const unchanged = await tasksModells
        .findById(id)
        .populate("assigned_to")
        .populate("createdBy")
        .populate("comments.user_id")
        .populate("attachments.user_id");
      return res.status(200).json(unchanged);
    }

    const task = await tasksModells
      .findByIdAndUpdate(id, updateDoc, { new: true })
      .populate("assigned_to")
      .populate("createdBy")
      .populate("comments.user_id")
      .populate("attachments.user_id");

    return res.status(200).json(task);
  } catch (err) {
    console.error("updateTask error:", err);
    return res.status(400).json({ error: err.message });
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


//Task Dashboard
const taskCards = async (req, res) => {
  try {
    const { startDate, endDate, department, user_id } = req.query;

    const match = {};

    // date filter (createdAt range)
    if (startDate && endDate) {
      match.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // department filter (if your User has department field)
    if (department) {
      match.$or = [
        { "assigned_to.department": department },
        { "createdBy.department": department },
      ];
    }

    // user filter
    if (user_id) {
      match.$or = [
        { createdBy: user_id },
        { assigned_to: user_id },
      ];
    }

    // aggregation pipeline
    const result = await tasksModells.aggregate([
      { $match: match },

      {
        $facet: {
          pending: [
            { $match: { "current_status.status": "pending" } },
            { $count: "count" },
          ],
          completed: [
            { $match: { "current_status.status": "completed" } },
            { $count: "count" },
          ],
          inProgress: [
            { $match: { "current_status.status": "in progress" } },
            { $count: "count" },
          ],
          cancelled: [
            { $match: { "current_status.status": "cancelled" } },
            { $count: "count" },
          ],
          assigned: [
            {
              $match: {
                $or: [
                  { createdBy: user_id ? new mongoose.Types.ObjectId(user_id) : null },
                  { assigned_to: user_id ? new mongoose.Types.ObjectId(user_id) : null },
                ],
              },
            },
            { $count: "count" },
          ],
        },
      },

      {
        $project: {
          pending: { $arrayElemAt: ["$pending.count", 0] },
          completed: { $arrayElemAt: ["$completed.count", 0] },
          inProgress: { $arrayElemAt: ["$inProgress.count", 0] },
          cancelled: { $arrayElemAt: ["$cancelled.count", 0] },
          assigned: { $arrayElemAt: ["$assigned.count", 0] },
        },
      },
    ]);

    return res.status(200).json({
      message: "Task cards fetched successfully",
      data: result[0] || {
        pending: 0,
        completed: 0,
        inProgress: 0,
        cancelled: 0,
        assigned: 0,
      },
    });
  } catch (error) {
    console.error("taskCards error:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

const myTasks = async (req, res) => {
  try {
    const { department, member } = req.query;
    const today = new Date();

    let match = {};

    // Department filter
    if (department) {
      const usersInDept = await User.find({ department }).select("_id");
      const userIds = usersInDept.map((u) => u._id.toString());

      match.$or = [
        { createdBy: { $in: userIds } },
        { assigned_to: { $in: userIds } },
      ];
    }

    // Member filter
    if (member) {
      if (!match.$or) match.$or = [];
      match.$or.push({ createdBy: member });
      match.$or.push({ assigned_to: { $in: [member] } });
    }

    // Fetch tasks with filters
    const tasks = await tasksModells.find(match)
      .populate("createdBy", "name emp_id department")
      .select("title description deadline createdBy assigned_to current_status")
      .sort({ deadline: 1 });

    // Separate overdue and upcoming
    const overdue = [];
    const upcoming = [];

    tasks.forEach((task) => {
      if (task.deadline && task.deadline < today) {
        overdue.push(task);
      } else {
        upcoming.push(task);
      }
    });

    return res.status(200).json({
      overdue,
      upcoming,
    });
  } catch (error) {
    console.error("myTasks error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const myCancelled = async (req, res) => {
  try {
    const { department, member } = req.query;

    let match = { "current_status.status": "cancelled" };

    // Department filter
    if (department) {
      const usersInDept = await User.find({ department }).select("_id");
      const userIds = usersInDept.map((u) => u._id.toString());

      match.$or = [
        { createdBy: { $in: userIds } },
        { assigned_to: { $in: userIds } },
      ];
    }

    // Member filter
    if (member) {
      if (!match.$or) match.$or = [];
      match.$or.push({ createdBy: member });
      match.$or.push({ assigned_to: { $in: [member] } });
    }

    // Fetch only cancelled tasks
    const cancelledTasks = await tasksModells.find(match)
      .populate("createdBy", "name emp_id department")
      .select("title description deadline createdBy assigned_to current_status")
      .sort({ deadline: 1 });

    return res.status(200).json({
      cancelled: cancelledTasks,
    });
  } catch (error) {
    console.error("myIssues error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const myWorkItemsToday = async (req, res) => {
  try {
    const { department, member } = req.query;

    // Start and end of today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    let match = {
      deadline: { $gte: todayStart, $lte: todayEnd },
      "current_status.status": { $ne: "cancelled" },
    };

    // Department filter
    if (department) {
      const usersInDept = await User.find({ department }).select("_id");
      const userIds = usersInDept.map((u) => u._id.toString());

      match.$or = [
        { createdBy: { $in: userIds } },
        { assigned_to: { $in: userIds } },
      ];
    }

    // Member filter
    if (member) {
      if (!match.$or) match.$or = [];
      match.$or.push({ createdBy: member });
      match.$or.push({ assigned_to: { $in: [member] } });
    }

    // Fetch tasks due today
    const tasksToday = await tasksModells.find(match)
      .populate("createdBy", "name emp_id department")
      .select("title description deadline createdBy assigned_to current_status")
      .sort({ deadline: 1 });

    return res.status(200).json({
      today: tasksToday,
    });
  } catch (error) {
    console.error("myWorkItemsToday error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

const myOverdueWorkItems = async (req, res) => {
  try {
    const { department, member } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let match = {
      deadline: { $lt: today }, // overdue
      "current_status.status": { $ne: "cancelled" }, // exclude cancelled
    };

    // Department filter
    if (department) {
      const usersInDept = await User.find({ department }).select("_id");
      const userIds = usersInDept.map((u) => u._id.toString());

      match.$or = [
        { createdBy: { $in: userIds } },
        { assigned_to: { $in: userIds } },
      ];
    }

    // Member filter
    if (member) {
      if (!match.$or) match.$or = [];
      match.$or.push({ createdBy: member });
      match.$or.push({ assigned_to: { $in: [member] } });
    }

    // Fetch overdue tasks
    const tasks = await tasksModells.find(match)
      .populate("createdBy", "name emp_id department")
      .select("title description deadline createdBy assigned_to current_status")
      .sort({ deadline: 1 });

    // Add lateBy (days)
    const tasksWithLate = tasks.map((task) => {
      const deadline = new Date(task.deadline);
      const diffDays = Math.ceil(
        (today.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        ...task.toObject(),
        lateBy: diffDays,
      };
    });

    return res.status(200).json({
      overdue: tasksWithLate,
    });
  } catch (error) {
    console.error("myOverdueWorkItems error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const taskStatusFunnel = async (req, res) => {
  try {
    const { department, member } = req.query;

    let match = {};

    // Department filter
    if (department) {
      const usersInDept = await User.find({ department }).select("_id");
      const userIds = usersInDept.map((u) => u._id.toString());

      match.$or = [
        { createdBy: { $in: userIds } },
        { assigned_to: { $in: userIds } },
      ];
    }

    // Member filter
    if (member) {
      if (!match.$or) match.$or = [];
      match.$or.push({ createdBy: member });
      match.$or.push({ assigned_to: { $in: [member] } });
    }

    const result = await tasksModells.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$current_status.status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Normalize counts
    const counts = {
      pending: 0,
      inprogress: 0,
      completed: 0,
      cancelled: 0,
    };

    result.forEach((r) => {
      const status = r._id?.toLowerCase();
      if (status && counts.hasOwnProperty(status)) {
        counts[status] = r.count;
      }
    });

    const total =
      counts.pending +
      counts.inprogress +
      counts.completed +
      counts.cancelled;

    return res.status(200).json({
      total,
      ...counts,
    });
  } catch (error) {
    console.error("taskStatusFunnel error:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
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

  //Task Dashboard
  taskCards,
  myTasks,
  myCancelled,
  myWorkItemsToday,
  myOverdueWorkItems,
  taskStatusFunnel
};
