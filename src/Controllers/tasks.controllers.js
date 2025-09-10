const TaskCounterSchema = require("../models/taskcounter.model");
const tasksModells = require("../models/task.model");
const User = require("../models/user.model");
const { Parser } = require("json2csv");
const sanitizeHtml = require("sanitize-html");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");
const mime = require("mime-types");
const { default: mongoose } = require("mongoose");

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

    let followers = [...assignedUserIds, userId.toString()];

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
    console.error("Error creating task:", err);
    res.status(400).json({ error: err.message });
  }
};
const getAllTasks = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser || !currentUser._id || !currentUser.role) {
      return res.status(401).json({ message: "Unauthorized: Invalid user." });
    }

    const userRole = String(currentUser.role || "").toLowerCase();

    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      from,
      to,
      deadlineFrom,
      deadlineTo,
      department = "",
      priorityFilter = "",
      createdById,
      assignedToId,
      hide_completed,
      hide_pending,
      hide_inprogress,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const searchRegex = new RegExp(search, "i");

    // --- helpers for dates ---
    const startOfDay = (iso) => {
      if (!iso) return undefined;
      const d = new Date(iso);
      if (isNaN(d)) return undefined;
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const nextDayStart = (iso) => {
      if (!iso) return undefined;
      const d = new Date(iso);
      if (isNaN(d)) return undefined;
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // ---- ACCESS CONTROL (pre lookup) ----
    const preLookupMatch = [];
    if (
      currentUser.emp_id === "SE-013" ||
      userRole === "admin" ||
      userRole === "superadmin"
    ) {
      // full access
    } else if (userRole === "manager") {
      // We'll enforce manager's same-department visibility after lookups.
    } else {
      // normal users: authored OR follower
      preLookupMatch.push({
        $or: [{ createdBy: currentUser._id }, { followers: currentUser._id }],
      });
    }

    const basePipeline = [];
    if (preLookupMatch.length > 0) {
      basePipeline.push({ $match: { $and: preLookupMatch } });
    }

    // ---- LOOKUPS ----
    basePipeline.push(
      // project (for search only)
      {
        $lookup: {
          from: "projectdetails",
          localField: "project_id",
          foreignField: "_id",
          as: "project_details",
        },
      },
      // main assignees -> need department
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to",
        },
      },
      // createdBy with department
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy_info",
        },
      },
      {
        $unwind: { path: "$createdBy_info", preserveNullAndEmptyArrays: true },
      },

      // ---- FLATTEN sub_tasks.assigned_to into an array of ObjectIds safely ----
      {
        $addFields: {
          sub_assignee_ids: {
            $reduce: {
              input: { $ifNull: ["$sub_tasks", []] },
              initialValue: [],
              in: {
                $setUnion: [
                  "$$value",
                  {
                    $cond: [
                      { $isArray: "$$this.assigned_to" },
                      { $ifNull: ["$$this.assigned_to", []] },
                      {
                        $cond: [
                          { $ne: ["$$this.assigned_to", null] },
                          ["$$this.assigned_to"],
                          [],
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },

      // lookup those sub_assignee_ids into user docs to get department
      {
        $lookup: {
          from: "users",
          let: { ids: "$sub_assignee_ids" },
          pipeline: [
            {
              $match: { $expr: { $in: ["$_id", { $ifNull: ["$$ids", []] }] } },
            },
            { $project: { _id: 1, name: 1, department: 1 } },
          ],
          as: "sub_assignees",
        },
      }
    );

    const postLookupMatch = [];

    // ---- Hide statuses (optional flags) ----
    const hideStatuses = [];
    if (hide_completed === "true") hideStatuses.push("completed");
    if (hide_pending === "true") hideStatuses.push("pending");
    if (hide_inprogress === "true") hideStatuses.push("in progress");
    if (hideStatuses.length > 0) {
      postLookupMatch.push({ "current_status.status": { $nin: hideStatuses } });
    }

    // ---- Text search ----
    if (search) {
      postLookupMatch.push({
        $or: [
          { title: searchRegex },
          { taskCode: searchRegex },
          { "project_details.code": searchRegex },
          { "project_details.name": searchRegex },
          { type: searchRegex },
          { sub_type: searchRegex },
        ],
      });
    }

    // ---- Status filter (optional) ----
    if (status) {
      postLookupMatch.push({ "current_status.status": status });
    }

    // ---- CREATED AT RANGE ----
    if (from || to) {
      const range = {};
      if (from) range.$gte = startOfDay(from);
      if (to) range.$lt = nextDayStart(to);
      postLookupMatch.push({ createdAt: range });
    }

    // ---- DEADLINE RANGE ----
    if (deadlineFrom || deadlineTo) {
      const dl = {};
      if (deadlineFrom) dl.$gte = startOfDay(deadlineFrom);
      if (deadlineTo) dl.$lt = nextDayStart(deadlineTo);
      postLookupMatch.push({ deadline: dl });
    }

    // ---- Department filter (UI-specified) ----
    if (department) {
      postLookupMatch.push({ "assigned_to.department": department });
    }

    // ---- createdById / assignedToId (UI-specified) ----
    if (createdById) {
      let cOID;
      try {
        cOID = new mongoose.Types.ObjectId(String(createdById));
      } catch (e) {
        return res
          .status(400)
          .json({ message: "Invalid createdById provided." });
      }
      postLookupMatch.push({ createdBy: cOID });
    }

    if (assignedToId) {
      let aOID;
      try {
        aOID = new mongoose.Types.ObjectId(String(assignedToId));
      } catch (e) {
        return res
          .status(400)
          .json({ message: "Invalid assignedToId provided." });
      }
      postLookupMatch.push({
        $or: [{ assigned_to: aOID }, { "sub_tasks.assigned_to": aOID }],
      });
    }

    // ---- Priority filter ----
    if (priorityFilter !== "" && priorityFilter !== undefined) {
      let priorities = [];
      if (Array.isArray(priorityFilter)) {
        priorities = priorityFilter.map(String);
      } else if (typeof priorityFilter === "string") {
        priorities = priorityFilter
          .split(/[,\s]+/)
          .filter(Boolean)
          .map(String);
      } else {
        priorities = [String(priorityFilter)];
      }
      priorities = priorities.filter((p) => ["1", "2", "3"].includes(p));

      if (priorities.length === 1) {
        postLookupMatch.push({ priority: priorities[0] });
      } else if (priorities.length > 1) {
        postLookupMatch.push({ priority: { $in: priorities } });
      }
    }

    // ---- MANAGER RULE: same-department visibility (with CAM Team override) ----
    if (userRole === "manager") {
      let effectiveDept = currentUser?.department || "";

      const camOverrideNames = new Set([
        "Sushant Ranjan Dubey",
        "Sanjiv Kumar",
      ]);
      if (camOverrideNames.has(String(currentUser?.name || ""))) {
        effectiveDept = "CAM Team";
      }

      if (effectiveDept) {
        postLookupMatch.push({
          $or: [
            { "createdBy_info.department": effectiveDept },
            { "assigned_to.department": effectiveDept },
            { "sub_assignees.department": effectiveDept },
          ],
        });
      }
    }

    if (postLookupMatch.length > 0) {
      basePipeline.push({ $match: { $and: postLookupMatch } });
    }

    // ---- OUTPUT ----
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
            // department: "$createdBy_info.department", // include if needed
          },
          followers: 1,
          sub_tasks: 1,
          sub_assignees: {
            $map: {
              input: "$sub_assignees",
              as: "s",
              in: {
                _id: "$$s._id",
                name: "$$s.name",
                department: "$$s.department",
              },
            },
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
      totalPages: Math.ceil(totalCount / Number(limit)),
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
      .populate("attachments.user_id", "_id name")
      .populate("followers", "_id name")
      .populate("sub_tasks.assigned_to", "_id name")
      .populate("sub_tasks.createdBy", "_id name");
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

    const existing = await tasksModells
      .findById(id)
      .select("taskCode assigned_to followers");
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

const createSubTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    let { assigned_to = [], deadline } = req.body;

    const task = await tasksModells.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // normalize assigned_to to an array of ObjectIds/strings
    if (!Array.isArray(assigned_to)) assigned_to = [assigned_to];
    assigned_to = assigned_to
      .filter(Boolean)
      .map((v) =>
        mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : v
      );

    if (assigned_to.length === 0) {
      return res
        .status(400)
        .json({ message: "assigned_to must be a non-empty array" });
    }

    const newSubtask = {
      assigned_to,
      ...(deadline ? { deadline } : {}),
      createdBy: req.user?.userId || null,
    };

    task.sub_tasks.push(newSubtask);

    // push assigned_to users into followers, avoiding duplicates
    const followersSet = new Set(
      (task.followers || []).map((f) => f.toString())
    );
    assigned_to.forEach((id) => followersSet.add(id.toString()));
    task.followers = Array.from(followersSet);

    await task.save();

    return res.status(200).json({
      message: "Subtask created successfully",
      task,
    });
  } catch (error) {
    console.error("Error creating subtask:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

//Task Dashboard
const safeObjectId = (v) => {
  try {
    if (!v) return null;
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    return null;
  }
};
const parseCsv = (s) =>
  String(s || "")
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const taskCards = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser || !currentUser._id || !currentUser.role) {
      return res.status(401).json({ message: "Unauthorized: Invalid user." });
    }

    const userRole = String(currentUser.role || "").toLowerCase();

    // ---- inputs ----
    const {
      from,
      to,
      deadlineFrom,
      deadlineTo,
      departments = "",
      createdById,
      assignedToId,
      mode = "all",
      status = "",
    } = req.query;

    const matchBlocks = [];

    // ---- dates on createdAt ----
    if (from || to) {
      const range = {};
      if (from) {
        const d = new Date(from);
        d.setHours(0, 0, 0, 0);
        range.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
        range.$lt = d;
      }
      matchBlocks.push({ createdAt: range });
    }

    // ---- dates on deadline / internal_deadline ----
    if (deadlineFrom || deadlineTo) {
      const dl = {};
      if (deadlineFrom) {
        const d = new Date(deadlineFrom);
        d.setHours(0, 0, 0, 0);
        dl.$gte = d;
      }
      if (deadlineTo) {
        const d = new Date(deadlineTo);
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
        dl.$lt = d;
      }
      matchBlocks.push({
        $or: [{ deadline: dl }, { internal_deadline: dl }],
      });
    }

    // ---- assignedToId / createdById filters ----
    const effectiveAssignedToId = assignedToId;
    const effectiveCreatedById = createdById;

    if (effectiveAssignedToId) {
      const aOID = safeObjectId(effectiveAssignedToId);
      if (!aOID) {
        return res
          .status(400)
          .json({ message: "Invalid assignedToId provided." });
      }
      // NOTE: for arrays, {$in: [id]} works; avoid $elemMatch with $in
      matchBlocks.push({
        $or: [
          { assigned_to: { $in: [aOID] } },
          { "sub_tasks.assigned_to": { $in: [aOID] } },
        ],
      });
    }

    if (effectiveCreatedById) {
      const cOID = safeObjectId(effectiveCreatedById);
      if (!cOID) {
        return res
          .status(400)
          .json({ message: "Invalid createdById provided." });
      }
      matchBlocks.push({
        $or: [
          { createdBy: { $in: [cOID] } },
          { "sub_tasks.createdBy": { $in: [cOID] } },
        ],
      });
    }

    // ---- status filter (optional) ----
    if (status) {
      matchBlocks.push({ "current_status.status": status });
    }

    const preAccess = [];
    if (
      currentUser.emp_id === "SE-013" ||
      userRole === "admin" ||
      userRole === "superadmin"
    ) {
      // full access
    } else if (userRole === "manager") {
      // manager needs department checks post-lookup — do nothing here
    } else {
      // regular user: authored OR follower
      preAccess.push({
        $or: [{ createdBy: currentUser._id }, { followers: currentUser._id }],
      });
    }

    // ---- department UI filter (string / CSV). We'll enforce after lookups.
    const deptList = parseCsv(departments);

    // ---- assemble initial $match
    const firstMatch =
      preAccess.length || matchBlocks.length
        ? {
            $match:
              (mode === "any"
                ? { $or: [...preAccess, ...matchBlocks] }
                : { $and: [...preAccess, ...matchBlocks] }) || {},
          }
        : { $match: {} };

    // ---- build pipeline
    const pipeline = [
      firstMatch,

      // main assignees (for department + manager rule)
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to_users",
        },
      },

      // createdBy info with department
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy_info",
        },
      },
      {
        $unwind: { path: "$createdBy_info", preserveNullAndEmptyArrays: true },
      },

      // flatten sub_tasks.assigned_to safely
      {
        $addFields: {
          sub_assignee_ids: {
            $reduce: {
              input: { $ifNull: ["$sub_tasks", []] },
              initialValue: [],
              in: {
                $setUnion: [
                  "$$value",
                  {
                    $cond: [
                      { $isArray: "$$this.assigned_to" },
                      { $ifNull: ["$$this.assigned_to", []] },
                      {
                        $cond: [
                          { $ne: ["$$this.assigned_to", null] },
                          ["$$this.assigned_to"],
                          [],
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },

      // lookup sub_assignees to get departments
      {
        $lookup: {
          from: "users",
          let: { ids: "$sub_assignee_ids" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$_id", { $ifNull: ["$$ids", []] }] },
              },
            },
            { $project: { _id: 1, name: 1, department: 1 } },
          ],
          as: "sub_assignees",
        },
      },
    ];

    // ---- manager rule
    if (userRole === "manager") {
      let effectiveDept = currentUser?.department || "";
      const camNames = new Set(["Sushant Ranjan Dubey", "Sanjiv Kumar"]);
      if (camNames.has(String(currentUser?.name || ""))) {
        effectiveDept = "CAM Team";
      }
      if (effectiveDept) {
        pipeline.push({
          $match: {
            $or: [
              { "createdBy_info.department": effectiveDept },
              { "assigned_to_users.department": effectiveDept },
              { "sub_assignees.department": effectiveDept },
            ],
          },
        });
      }
    }

    // ---- department filter from UI (if any). Accept one or many department names.
    if (deptList.length > 0) {
      pipeline.push({
        $match: {
          $or: [
            { "createdBy_info.department": { $in: deptList } },
            { "assigned_to_users.department": { $in: deptList } },
            { "sub_assignees.department": { $in: deptList } },
          ],
        },
      });
    }

    // ---- final stats
    pipeline.push(
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ["$current_status.status", "completed"] }, 1, 0],
            },
          },
          pending: {
            $sum: {
              $cond: [{ $eq: ["$current_status.status", "pending"] }, 1, 0],
            },
          },
          in_progress: {
            $sum: {
              $cond: [{ $eq: ["$current_status.status", "in progress"] }, 1, 0],
            },
          },
          cancelled: {
            $sum: {
              $cond: [{ $eq: ["$current_status.status", "cancelled"] }, 1, 0],
            },
          },
          draft: {
            $sum: {
              $cond: [{ $eq: ["$current_status.status", "draft"] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
          completed: 1,
          pending: 1,
          in_progress: 1,
          cancelled: 1,
          draft: 1,
          active: { $add: ["$pending", "$in_progress"] },
        },
      }
    );

    const agg = await tasksModells.aggregate(pipeline);
    const result = agg[0] || {
      total: 0,
      completed: 0,
      pending: 0,
      in_progress: 0,
      cancelled: 0,
      draft: 0,
      active: 0,
    };

    return res.status(200).json({
      message: "Task stats fetched successfully",
      filters_applied: {
        from: from || null,
        to: to || null,
        deadlineFrom: deadlineFrom || null,
        deadlineTo: deadlineTo || null,
        createdById: effectiveCreatedById || null,
        assignedToId: effectiveAssignedToId || null,
        departments: deptList,
        mode,
        status: status || null,
      },
      data: result,
    });
  } catch (err) {
    console.error("taskCards error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const parseCsvObjectIds = (v) => parseCsv(v).map(safeObjectId).filter(Boolean);

function parseWindow(s = "25m") {
  const m = String(s)
    .trim()
    .match(/^(\d+)\s*(m|h)$/i);
  if (!m) return 25 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  return unit === "h" ? n * 60 * 60 * 1000 : n * 60 * 1000;
}

// IST midnight -> UTC Date
function getISTStartOfTodayUTC(now = new Date()) {
  const IST_OFFSET_MIN = 330; // +05:30
  const istMs = now.getTime() + IST_OFFSET_MIN * 60 * 1000;
  const ist = new Date(istMs);
  ist.setHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MIN * 60 * 1000);
}

function formatIST_HHMM(date) {
  return new Date(date).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/* ---------- utils ---------- */
function parseWindow(s = "25m") {
  const m = String(s)
    .trim()
    .match(/^(\d+)\s*(m|h)$/i);
  if (!m) return 25 * 60 * 1000;
  const n = parseInt(m[1], 10);
  return m[2].toLowerCase() === "h" ? n * 3600 * 1000 : n * 60 * 1000;
}

// IST midnight -> UTC Date
function getISTStartOfTodayUTC(now = new Date()) {
  const IST_OFFSET_MIN = 330; // +05:30
  const istMs = now.getTime() + IST_OFFSET_MIN * 60 * 1000;
  const ist = new Date(istMs);
  ist.setHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MIN * 60 * 1000);
}

function formatIST_HHMM(date) {
  return new Date(date).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/* ---------- controller ---------- */
const myTasks = async function (req, res) {
  try {
    const {
      from,
      to,
      deadlineFrom,
      deadlineTo,
      departments = "",
      createdById,
      window = "25m",
      assignedToId, // <-- already in your query
      q,
    } = req.query;

    const currentUserId = req.user?.userId;
    const currentUser = await User.findById(currentUserId).lean();
    if (!currentUser)
      return res.status(404).json({ message: "User not found" });

    const userRole = currentUser?.role || "user";
    const empId = currentUser?.emp_id;

    const now = new Date();
    const istStartTodayUTC = getISTStartOfTodayUTC(now);

    // createdAt bounds
    const customFrom = from ? new Date(from) : null;
    const customTo = to ? new Date(to) : null;

    const isPrivileged =
      empId === "SE-013" || userRole === "admin" || userRole === "superadmin";

    let createdAtMatch = {};
    if (customFrom || customTo) {
      if (customFrom) createdAtMatch.$gte = customFrom;
      if (customTo) createdAtMatch.$lte = customTo;
    } else if (isPrivileged) {
      createdAtMatch = { $gte: istStartTodayUTC, $lte: now };
    } else {
      const lower = new Date(
        Math.max(
          istStartTodayUTC.getTime(),
          now.getTime() - parseWindow(window)
        )
      );
      createdAtMatch = { $gte: lower, $lte: now };
    }

    // deadline range (optional)
    let deadlineMatch = null;
    if (deadlineFrom || deadlineTo) {
      deadlineMatch = {};
      if (deadlineFrom) deadlineMatch.$gte = new Date(deadlineFrom);
      if (deadlineTo) deadlineMatch.$lte = new Date(deadlineTo);
    }

    const createdByIds = createdById ? parseCsvObjectIds(createdById) : [];
    const assignedToIds = assignedToId ? parseCsvObjectIds(assignedToId) : []; // <-- NEW
    const deptList = parseCsv(departments);

    /* ---------- pipeline ---------- */
    const pipeline = [{ $match: { createdAt: createdAtMatch } }];
    if (deadlineMatch) pipeline.push({ $match: { deadline: deadlineMatch } });

    // Build subtask_creator_ids for everyone
    pipeline.push({
      $addFields: {
        subtask_creator_ids: {
          $map: {
            input: { $ifNull: ["$sub_tasks", []] },
            as: "st",
            in: { $ifNull: ["$$st.created_by", null] },
          },
        },
      },
    });

    // ACL for regular users
    if (!isPrivileged && userRole !== "manager") {
      pipeline.push({
        $match: {
          $or: [
            { createdBy: safeObjectId(currentUserId) },
            { subtask_creator_ids: safeObjectId(currentUserId) },
          ],
        },
      });
    }

    // ---- assignedToId FILTER (top-level task assignees) ----
    if (assignedToIds.length) {
      pipeline.push({
        $match: {
          assigned_to: { $in: assignedToIds },
        },
      });

      // If you ALSO want to include matches where any subtask is assigned to these users,
      // use this combined match instead (replace the $match above):
      /*
      pipeline.push({
        $match: {
          $or: [
            { assigned_to: { $in: assignedToIds } },
            {
              sub_tasks: {
                $elemMatch: {
                  assigned_to: { $elemMatch: { $in: assignedToIds } },
                },
              },
            },
          ],
        },
      });
      */
    }

    // Lookups: creator, subtask creators, and assignees
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy_info",
        },
      },
      {
        $unwind: { path: "$createdBy_info", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "users",
          localField: "subtask_creator_ids",
          foreignField: "_id",
          as: "subtask_creators",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to_users",
        },
      }
    );

    // Manager department scope (creator only)
    if (userRole === "manager") {
      let effectiveDept = currentUser?.department || "";
      const camNames = new Set(["Sushant Ranjan Dubey", "Sanjiv Kumar"]);
      if (camNames.has(String(currentUser?.name || "")))
        effectiveDept = "CAM Team";
      if (effectiveDept) {
        pipeline.push({
          $match: { "createdBy_info.department": effectiveDept },
        });
      }
    }

    // Filter by creators (CSV)
    if (createdByIds.length) {
      pipeline.push({ $match: { createdBy: { $in: createdByIds } } });
    }

    // Department filter (explicit) — creator only
    if (deptList.length) {
      pipeline.push({
        $match: { "createdBy_info.department": { $in: deptList } },
      });
    }

    // Derive names for search
    pipeline.push({
      $addFields: {
        createdbyname: "$createdBy_info.name",
        subtask_createdby_names: {
          $map: {
            input: { $ifNull: ["$subtask_creators", []] },
            as: "u",
            in: "$$u.name",
          },
        },
        assigned_to_names: {
          $map: {
            input: { $ifNull: ["$assigned_to_users", []] },
            as: "u",
            in: "$$u.name",
          },
        },
      },
    });

    // Search (as before)
    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), "i");
      pipeline.push({
        $match: {
          $or: [
            { "current_status.status": rx },
            { createdbyname: rx },
            { subtask_createdby_names: rx },
          ],
        },
      });
    }

    // Final projection
    pipeline.push({
      $project: {
        _id: 1,
        createdAt: 1,
        deadline: 1,
        "current_status.status": 1,
        taskname: {
          $ifNull: [
            "$title",
            {
              $ifNull: ["$task_name", { $ifNull: ["$name", "Untitled Task"] }],
            },
          ],
        },
        createdbyname: 1,
        subtask_createdby: {
          $cond: [
            {
              $gt: [
                { $size: { $ifNull: ["$subtask_createdby_names", []] } },
                0,
              ],
            },
            {
              $reduce: {
                input: "$subtask_createdby_names",
                initialValue: "",
                in: {
                  $concat: [
                    {
                      $cond: [
                        { $eq: ["$$value", ""] },
                        "",
                        { $concat: ["$$value", ", "] },
                      ],
                    },
                    "$$this",
                  ],
                },
              },
            },
            "",
          ],
        },
        assigned_to: {
          $map: {
            input: { $ifNull: ["$assigned_to_users", []] },
            as: "u",
            in: { _id: "$$u._id", name: "$$u.name", avatar: "$$u.avatar" },
          },
        },
        assigned_toname: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$assigned_to_names", []] } }, 0] },
            {
              $reduce: {
                input: "$assigned_to_names",
                initialValue: "",
                in: {
                  $concat: [
                    {
                      $cond: [
                        { $eq: ["$$value", ""] },
                        "",
                        { $concat: ["$$value", ", "] },
                      ],
                    },
                    "$$this",
                  ],
                },
              },
            },
            "",
          ],
        },
      },
    });

    // Execute
    const rows = await tasksModells.aggregate(pipeline);

    // Shape for UI
    const data = rows.map((t) => ({
      id: t._id,
      title: t.taskname,
      time: formatIST_HHMM(t.createdAt),
      deadline: t.deadline || null,
      current_status: { status: t?.["current_status"]?.status || "—" },
      created_by: t.createdbyname || "—",
      subtask_createdby: t.subtask_createdby || "",
      assigned_to: t.assigned_to || [],
    }));

    return res.status(200).json({
      filters: {
        from: customFrom || null,
        to: customTo || null,
        deadlineFrom: deadlineFrom || null,
        deadlineTo: deadlineTo || null,
        departments: deptList,
        createdById: createdByIds,
        assignedToId: assignedToIds, // <-- echo back filter
        window:
          customFrom || customTo ? null : isPrivileged ? "TODAY(IST)" : window,
        q: q || "",
      },
      count: data.length,
      data,
    });
  } catch (err) {
    console.error("myTasks error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const activityFeed = async function (req, res) {
  try {
    const currentUserId = req.user?.userId;
    const currentUser = await User.findById(currentUserId).lean();
    if (!currentUser)
      return res.status(404).json({ message: "User not found" });

    const userRole = currentUser?.role || "user";
    const empId = currentUser?.emp_id;

    const isPrivileged =
      empId === "SE-013" || userRole === "admin" || userRole === "superadmin";

    const pipeline = [];

    pipeline.push({
      $addFields: {
        subtask_creator_ids: {
          $map: {
            input: { $ifNull: ["$sub_tasks", []] },
            as: "st",
            in: { $ifNull: ["$$st.created_by", null] },
          },
        },
      },
    });

    // ACL for regular users
    if (!isPrivileged && userRole !== "manager") {
      pipeline.push({
        $match: {
          $or: [
            { createdBy: safeObjectId(currentUserId) },
            { subtask_creator_ids: safeObjectId(currentUserId) },
          ],
        },
      });
    }

    // Look up creator (for manager department rule & task title fallback)
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy_info",
        },
      },
      { $unwind: { path: "$createdBy_info", preserveNullAndEmptyArrays: true } }
    );

    // Manager dept scope (creator-only)
    if (userRole === "manager") {
      let effectiveDept = currentUser?.department || "";
      const camNames = new Set(["Sushant Ranjan Dubey", "Sanjiv Kumar"]);
      if (camNames.has(String(currentUser?.name || "")))
        effectiveDept = "CAM Team";

      if (effectiveDept) {
        pipeline.push({
          $match: { "createdBy_info.department": effectiveDept },
        });
      }
    }

    // Only keep tasks that actually have comments
    pipeline.push({
      $match: {
        comments: { $exists: true, $ne: [] },
      },
    });

    // Unwind comments and sort by latest comment timestamp
    pipeline.push(
      { $unwind: "$comments" },
      { $sort: { "comments.updatedAt": -1 } },
      { $limit: 100 }
    );

    // Join commenter info
    pipeline.push({
      $lookup: {
        from: "users",
        localField: "comments.user_id",
        foreignField: "_id",
        as: "comment_user",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$comment_user",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Final projection
    pipeline.push({
      $project: {
        task_id: "$_id",
        taskCode: "$taskCode",
        comment_id: "$comments._id",
        remarks: "$comments.remarks",
        updatedAt: "$comments.updatedAt",
        commenter_name: "$comment_user.name",
        commenter_avatar: "$comment_user.avatar",

        // nice fallback for task title
        task_title: {
          $ifNull: [
            "$title",
            {
              $ifNull: ["$task_name", { $ifNull: ["$name", "Untitled Task"] }],
            },
          ],
        },
      },
    });

    const rows = await tasksModells.aggregate(pipeline);

    // util: "10 min ago", "2 h ago", "3 d ago"
    const timeAgo = (ts) => {
      const now = Date.now();
      const t = new Date(ts).getTime();
      const diff = Math.max(0, now - t);

      const sec = Math.floor(diff / 1000);
      if (sec < 60) return `${sec}s ago`;

      const min = Math.floor(sec / 60);
      if (min < 60) return `${min} min ago`;

      const hr = Math.floor(min / 60);
      if (hr < 24) return `${hr} h ago`;

      const d = Math.floor(hr / 24);
      return `${d} d ago`;
    };

    // shape for UI ActivityFeedCard
    const data = rows.map((r) => ({
      id: r.comment_id,
      task_id: r.task_id,
      task_code: r.taskCode,
      name: r.commenter_name || "—",
      avatar: r.commenter_avatar || "",
      action: "commented on",
      project: r.task_title || "Untitled Task",
      remarks: r.remarks || "",
      ago: timeAgo(r.updatedAt),
    }));

    return res.status(200).json({
      count: data.length,
      data,
    });
  } catch (err) {
    console.error("activityFeed error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};
const escRx = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parseDateOrNull = (v) => {
  try {
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
};
const getUserPerformance = async (req, res) => {
  try {
    const {
      // target (optional) — if none provided, returns list for all allowed users
      userId,
      name,
      q,

      // filters
      from,
      to,
      deadlineFrom,
      deadlineTo,

      // options
      includeSubtasks = "true",
    } = req.query;

    /* ---------- requester ---------- */
    const currentUserId = req.user?.userId;
    const currentUser = await User.findById(currentUserId)
      .select("name role emp_id department")
      .lean();
    if (!currentUser)
      return res.status(404).json({ message: "User not found" });

    const userRole = currentUser?.role || "user";
    const empId = currentUser?.emp_id || "";
    const isPrivileged =
      empId === "SE-013" || userRole === "admin" || userRole === "superadmin";

    /* ---------- common filters ---------- */
    const createdAtMatch = {};
    const fFrom = parseDateOrNull(from);
    const fTo = parseDateOrNull(to);
    if (fFrom) createdAtMatch.$gte = fFrom;
    if (fTo) createdAtMatch.$lte = fTo;

    let deadlineMatch = null;
    const dFrom = parseDateOrNull(deadlineFrom);
    const dTo = parseDateOrNull(deadlineTo);
    if (dFrom || dTo) {
      deadlineMatch = {};
      if (dFrom) deadlineMatch.$gte = dFrom;
      if (dTo) deadlineMatch.$lte = dTo;
    }

    const wantsSubtasks = String(includeSubtasks) !== "false";
    const now = new Date();

    /* =======================================================================
       MODE A: SINGLE USER (userId or name/q provided)
       ======================================================================= */
    if (userId || (name ?? q)) {
      // -------- resolve target user --------
      let targetUser, targetUserId;

      if (userId) {
        targetUserId = safeObjectId(userId);
        if (!targetUserId)
          return res.status(400).json({ message: "Invalid userId" });
        targetUser = await User.findById(targetUserId)
          .select("name avatar department")
          .lean();
        if (!targetUser)
          return res.status(404).json({ message: "Target user not found" });
      } else {
        const nameQuery = (name ?? q ?? "").trim();
        if (!nameQuery) {
          return res
            .status(400)
            .json({ message: "Provide userId or name (q) to search" });
        }
        const rx = new RegExp(escRx(nameQuery), "i");
        const userFindFilter = { name: rx };
        // (optional) restrict to manager's dept on search:
        // if (userRole === "manager") userFindFilter.department = currentUser.department || undefined;

        targetUser = await User.findOne(userFindFilter)
          .select("name avatar department")
          .lean();
        if (!targetUser)
          return res
            .status(404)
            .json({ message: "No user matched the provided name" });
        targetUserId = targetUser._id;
      }

      // ACL: regular can only query themselves
      if (
        !isPrivileged &&
        userRole !== "manager" &&
        String(targetUserId) !== String(currentUserId)
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const pipeline = [];

      if (Object.keys(createdAtMatch).length)
        pipeline.push({ $match: { createdAt: createdAtMatch } });
      if (deadlineMatch) pipeline.push({ $match: { deadline: deadlineMatch } });

      // collect sub_assignee_ids from subtasks
      pipeline.push({
        $addFields: {
          sub_assignee_ids: {
            $reduce: {
              input: { $ifNull: ["$sub_tasks", []] },
              initialValue: [],
              in: {
                $setUnion: ["$$value", { $ifNull: ["$$this.assigned_to", []] }],
              },
            },
          },
        },
      });

      // lookups for manager scoping
      pipeline.push(
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
        },
        {
          $lookup: {
            from: "users",
            localField: "assigned_to",
            foreignField: "_id",
            as: "assigned_to_users",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "sub_assignee_ids",
            foreignField: "_id",
            as: "sub_assignees",
          },
        }
      );

      // manager scope (doc-level)
      if (userRole === "manager") {
        let effectiveDept = currentUser?.department || "";
        const camNames = new Set(["Sushant Ranjan Dubey", "Sanjiv Kumar"]);
        if (camNames.has(String(currentUser?.name || "")))
          effectiveDept = "CAM Team";

        if (effectiveDept) {
          pipeline.push({
            $match: {
              $or: [
                { "createdBy_info.department": effectiveDept },
                { "assigned_to_users.department": effectiveDept },
                { "sub_assignees.department": effectiveDept },
              ],
            },
          });
        }
      }

      // assignment flags for target user
      pipeline.push({
        $addFields: {
          isAssignedTask: {
            $in: [targetUserId, { $ifNull: ["$assigned_to", []] }],
          },
          isAssignedSubtask: wantsSubtasks
            ? { $in: [targetUserId, { $ifNull: ["$sub_assignee_ids", []] }] }
            : false,
        },
      });

      // keep only docs where target appears
      pipeline.push(
        {
          $addFields: {
            isAssigned: { $or: ["$isAssignedTask", "$isAssignedSubtask"] },
          },
        },
        { $match: { isAssigned: true } }
      );

      // normalize status + delayed/completed flags
      pipeline.push(
        {
          $addFields: {
            statusLower: {
              $toLower: { $ifNull: ["$current_status.status", ""] },
            },
            hasDeadline: {
              $cond: [{ $ifNull: ["$deadline", false] }, true, false],
            },
          },
        },
        {
          $addFields: {
            isCompleted: { $eq: ["$statusLower", "completed"] },
            isDelayed: {
              $and: [
                "$hasDeadline",
                { $lt: ["$deadline", now] },
                { $ne: ["$statusLower", "completed"] },
                { $ne: ["$statusLower", "cancelled"] },
              ],
            },
          },
        }
      );

      // group totals
      pipeline.push({
        $group: {
          _id: null,
          assigned: { $sum: 1 },
          completed: { $sum: { $cond: ["$isCompleted", 1, 0] } },
          delayed: { $sum: { $cond: ["$isDelayed", 1, 0] } },

          taskAssigned: { $sum: { $cond: ["$isAssignedTask", 1, 0] } },
          taskCompleted: {
            $sum: {
              $cond: [{ $and: ["$isAssignedTask", "$isCompleted"] }, 1, 0],
            },
          },
          taskDelayed: {
            $sum: {
              $cond: [{ $and: ["$isAssignedTask", "$isDelayed"] }, 1, 0],
            },
          },

          subAssigned: { $sum: { $cond: ["$isAssignedSubtask", 1, 0] } },
          subCompleted: {
            $sum: {
              $cond: [{ $and: ["$isAssignedSubtask", "$isCompleted"] }, 1, 0],
            },
          },
          subDelayed: {
            $sum: {
              $cond: [{ $and: ["$isAssignedSubtask", "$isDelayed"] }, 1, 0],
            },
          },
        },
      });

      const agg = await tasksModells.aggregate(pipeline);
      const g = agg?.[0] || {
        assigned: 0,
        completed: 0,
        delayed: 0,
        taskAssigned: 0,
        taskCompleted: 0,
        taskDelayed: 0,
        subAssigned: 0,
        subCompleted: 0,
        subDelayed: 0,
      };
      const completionPct =
        g.assigned > 0
          ? Number(((g.completed / g.assigned) * 100).toFixed(2))
          : 0;

      const userDoc =
        targetUser ||
        (await User.findById(targetUserId)
          .select("name avatar department")
          .lean());

      return res.status(200).json({
        mode: "single",
        user: {
          _id: userDoc?._id || targetUserId,
          name: userDoc?.name || "",
          avatar: userDoc?.avatar || "",
          department: userDoc?.department || "",
        },
        filters: {
          from: fFrom || null,
          to: fTo || null,
          deadlineFrom: dFrom || null,
          deadlineTo: dTo || null,
          includeSubtasks: wantsSubtasks,
        },
        stats: {
          assigned: g.assigned,
          completed: g.completed,
          delayed: g.delayed,
          completionPct,
        },
        breakdown: {
          tasks: {
            assigned: g.taskAssigned,
            completed: g.taskCompleted,
            delayed: g.taskDelayed,
          },
          subtasks: {
            assigned: g.subAssigned,
            completed: g.subCompleted,
            delayed: g.subDelayed,
          },
        },
      });
    }

    /* =======================================================================
       MODE B: LIST (no userId and no name/q) → return all allowed users
       ======================================================================= */
    const pipeline = [];

    if (Object.keys(createdAtMatch).length)
      pipeline.push({ $match: { createdAt: createdAtMatch } });
    if (deadlineMatch) pipeline.push({ $match: { deadline: deadlineMatch } });

    // compute sub_assignee_ids and union of assignees
    pipeline.push({
      $addFields: {
        sub_assignee_ids: {
          $reduce: {
            input: { $ifNull: ["$sub_tasks", []] },
            initialValue: [],
            in: {
              $setUnion: ["$$value", { $ifNull: ["$$this.assigned_to", []] }],
            },
          },
        },
      },
    });

    // lookups for manager scoping (doc-level)
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy_info",
        },
      },
      {
        $unwind: { path: "$createdBy_info", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to_users",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "sub_assignee_ids",
          foreignField: "_id",
          as: "sub_assignees",
        },
      }
    );

    if (userRole === "manager") {
      let effectiveDept = currentUser?.department || "";
      const camNames = new Set(["Sushant Ranjan Dubey", "Sanjiv Kumar"]);
      if (camNames.has(String(currentUser?.name || "")))
        effectiveDept = "CAM Team";

      if (effectiveDept) {
        pipeline.push({
          $match: {
            $or: [
              { "createdBy_info.department": effectiveDept },
              { "assigned_to_users.department": effectiveDept },
              { "sub_assignees.department": effectiveDept },
            ],
          },
        });
      }
    }

    // Normalize status, completion, delay
    pipeline.push(
      {
        $addFields: {
          statusLower: {
            $toLower: { $ifNull: ["$current_status.status", ""] },
          },
          hasDeadline: {
            $cond: [{ $ifNull: ["$deadline", false] }, true, false],
          },
        },
      },
      {
        $addFields: {
          isCompleted: { $eq: ["$statusLower", "completed"] },
          isDelayed: {
            $and: [
              "$hasDeadline",
              { $lt: ["$deadline", now] },
              { $ne: ["$statusLower", "completed"] },
              { $ne: ["$statusLower", "cancelled"] },
            ],
          },
        },
      }
    );

    // Build union of assignees for overall (deduplicated per task doc)
    pipeline.push({
      $addFields: {
        union_assignees: wantsSubtasks
          ? {
              $setUnion: [
                { $ifNull: ["$assigned_to", []] },
                { $ifNull: ["$sub_assignee_ids", []] },
              ],
            }
          : { $ifNull: ["$assigned_to", []] },
      },
    });

    // explode per assignee (per task doc → at most one record per user due to setUnion)
    pipeline.push({
      $unwind: { path: "$union_assignees", preserveNullAndEmptyArrays: false },
    });

    // For each (task, user) row compute whether user was task-assigned and/or subtask-assigned
    pipeline.push({
      $addFields: {
        assigneeId: "$union_assignees",
        isAssignedTaskUser: {
          $in: ["$union_assignees", { $ifNull: ["$assigned_to", []] }],
        },
        isAssignedSubtaskUser: wantsSubtasks
          ? {
              $in: ["$union_assignees", { $ifNull: ["$sub_assignee_ids", []] }],
            }
          : false,
      },
    });

    // Non-privileged non-manager can only see themselves in the list
    if (!isPrivileged && userRole !== "manager") {
      pipeline.push({ $match: { assigneeId: safeObjectId(currentUserId) } });
    }

    // Join user info for each assignee and (optionally) filter user set by manager dept as well
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "assigneeId",
          foreignField: "_id",
          as: "u",
        },
      },
      { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } }
    );

    if (userRole === "manager") {
      let effectiveDept = currentUser?.department || "";
      const camNames = new Set(["Sushant Ranjan Dubey", "Sanjiv Kumar"]);
      if (camNames.has(String(currentUser?.name || "")))
        effectiveDept = "CAM Team";
      if (effectiveDept) {
        pipeline.push({ $match: { "u.department": effectiveDept } });
      }
    }

    // Group per user
    pipeline.push({
      $group: {
        _id: "$assigneeId",
        name: { $first: "$u.name" },
        avatar: { $first: "$u.avatar" },
        department: { $first: "$u.department" },

        assigned: { $sum: 1 },
        completed: { $sum: { $cond: ["$isCompleted", 1, 0] } },
        delayed: { $sum: { $cond: ["$isDelayed", 1, 0] } },

        taskAssigned: { $sum: { $cond: ["$isAssignedTaskUser", 1, 0] } },
        taskCompleted: {
          $sum: {
            $cond: [{ $and: ["$isAssignedTaskUser", "$isCompleted"] }, 1, 0],
          },
        },
        taskDelayed: {
          $sum: {
            $cond: [{ $and: ["$isAssignedTaskUser", "$isDelayed"] }, 1, 0],
          },
        },

        subAssigned: { $sum: { $cond: ["$isAssignedSubtaskUser", 1, 0] } },
        subCompleted: {
          $sum: {
            $cond: [{ $and: ["$isAssignedSubtaskUser", "$isCompleted"] }, 1, 0],
          },
        },
        subDelayed: {
          $sum: {
            $cond: [{ $and: ["$isAssignedSubtaskUser", "$isDelayed"] }, 1, 0],
          },
        },
      },
    });

    // Optional sort: completion ratio desc, then assigned desc
    pipeline.push({
      $addFields: {
        completionPct: {
          $cond: [
            { $gt: ["$assigned", 0] },
            { $multiply: [{ $divide: ["$completed", "$assigned"] }, 100] },
            0,
          ],
        },
      },
    });
    pipeline.push({ $sort: { completionPct: -1, assigned: -1, name: 1 } });

    const rows = await tasksModells.aggregate(pipeline);

    return res.status(200).json({
      mode: "list",
      filters: {
        from: fFrom || null,
        to: fTo || null,
        deadlineFrom: dFrom || null,
        deadlineTo: dTo || null,
        includeSubtasks: wantsSubtasks,
      },
      count: rows.length,
      users: rows.map((r) => ({
        _id: r._id,
        name: r.name || "",
        avatar: r.avatar || "",
        department: r.department || "",
        stats: {
          assigned: r.assigned || 0,
          completed: r.completed || 0,
          delayed: r.delayed || 0,
          completionPct: Number((r.completionPct || 0).toFixed(2)),
        },
        breakdown: {
          tasks: {
            assigned: r.taskAssigned || 0,
            completed: r.taskCompleted || 0,
            delayed: r.taskDelayed || 0,
          },
          subtasks: {
            assigned: r.subAssigned || 0,
            completed: r.subCompleted || 0,
            delayed: r.subDelayed || 0,
          },
        },
      })),
    });
  } catch (err) {
    console.error("getUserPerformance error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const getProjectsByState = async (req, res) => {
  try {
    const { from, to, deadlineFrom, deadlineTo } = req.query;

    // ---- current user & ACL
    const currentUserId = req.user?.userId;
    const currentUser = await User.findById(currentUserId)
      .select("name role emp_id department")
      .lean();
    if (!currentUser)
      return res.status(404).json({ message: "User not found" });

    const userRole = currentUser?.role || "user";
    const empId = currentUser?.emp_id || "";
    const isPrivileged =
      empId === "SE-013" || userRole === "admin" || userRole === "superadmin";

    // ---- date filters
    const createdAtMatch = {};
    const fFrom = parseDateOrNull(from);
    const fTo = parseDateOrNull(to);
    if (fFrom) createdAtMatch.$gte = fFrom;
    if (fTo) createdAtMatch.$lte = fTo;

    let deadlineMatch = null;
    const dFrom = parseDateOrNull(deadlineFrom);
    const dTo = parseDateOrNull(deadlineTo);
    if (dFrom || dTo) {
      deadlineMatch = {};
      if (dFrom) deadlineMatch.$gte = dFrom;
      if (dTo) deadlineMatch.$lte = dTo;
    }

    // ---- pipeline
    const pipeline = [];

    // createdAt range
    if (Object.keys(createdAtMatch).length) {
      pipeline.push({ $match: { createdAt: createdAtMatch } });
    }
    // deadline range
    if (deadlineMatch) {
      pipeline.push({ $match: { deadline: deadlineMatch } });
    }

    // collect subtask assignees for ACL
    pipeline.push({
      $addFields: {
        sub_assignee_ids: {
          $reduce: {
            input: { $ifNull: ["$sub_tasks", []] },
            initialValue: [],
            in: {
              $setUnion: ["$$value", { $ifNull: ["$$this.assigned_to", []] }],
            },
          },
        },
      },
    });

    // lookups for ACL scoping (manager dept)
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy_info",
        },
      },
      {
        $unwind: { path: "$createdBy_info", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to_users",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "sub_assignee_ids",
          foreignField: "_id",
          as: "sub_assignees",
        },
      }
    );

    // ACL
    if (!isPrivileged && userRole !== "manager") {
      const me = safeObjectId(currentUserId);
      pipeline.push({
        $match: {
          $or: [
            { createdBy: me },
            { assigned_to: me },
            { sub_assignee_ids: me },
          ],
        },
      });
    } else if (userRole === "manager") {
      let effectiveDept = currentUser?.department || "";
      const camNames = new Set(["Sushant Ranjan Dubey", "Sanjiv Kumar"]);
      if (camNames.has(String(currentUser?.name || "")))
        effectiveDept = "CAM Team";

      if (effectiveDept) {
        pipeline.push({
          $match: {
            $or: [
              { "createdBy_info.department": effectiveDept },
              { "assigned_to_users.department": effectiveDept },
              { "sub_assignees.department": effectiveDept },
            ],
          },
        });
      }
    }

    // Only tasks that have a project attached
    pipeline.push({ $match: { project_id: { $exists: true, $ne: [] } } });

    // Unwind project_id and fetch projectDetail to read its state
    pipeline.push(
      { $unwind: "$project_id" },
      {
        $lookup: {
          from: "projectdetails", // collection name for model "projectDetail"
          localField: "project_id",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: false } },
      // ignore projects without state
      { $match: { "project.state": { $exists: true, $ne: null, $ne: "" } } }
    );

    // Count UNIQUE projects per state
    pipeline.push({
      $group: {
        _id: "$project.state",
        projects: { $addToSet: "$project._id" }, // dedupe by project
      },
    });

    // turn set size into count
    pipeline.push({
      $project: {
        _id: 0,
        state: "$_id",
        count: { $size: "$projects" },
      },
    });

    // sort highest first, then alpha
    pipeline.push({ $sort: { count: -1, state: 1 } });

    const rows = await tasksModells.aggregate(pipeline);

    const totalProjects = rows.reduce((s, r) => s + (r.count || 0), 0);
    const distribution = rows.map((r) => ({
      state: r.state,
      count: r.count,
      pct:
        totalProjects > 0
          ? Number(((r.count / totalProjects) * 100).toFixed(2))
          : 0,
    }));

    return res.status(200).json({
      totalProjects,
      distribution, // [{ state, count, pct }]
      labels: distribution.map((d) => d.state),
      series: distribution.map((d) => d.pct), // for donut %
      counts: distribution.map((d) => d.count), // raw counts (legends)
      filters: {
        from: fFrom || null,
        to: fTo || null,
        deadlineFrom: dFrom || null,
        deadlineTo: dTo || null,
      },
    });
  } catch (err) {
    console.error("getProjectsByState error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const getAgingByResolution = async (req, res) => {
  try {
    const {
      from, to, deadlineFrom, deadlineTo,
      uptoDays = "30",
    } = req.query;

    const currentUserId = req.user?.userId;
    const currentUser = await User.findById(currentUserId)
      .select("name role emp_id department")
      .lean();
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    const userRole = currentUser?.role || "user";
    const empId = currentUser?.emp_id || "";
    const isPrivileged =
      empId === "SE-013" || userRole === "admin" || userRole === "superadmin";

    // -------- filters --------
    const createdAtMatch = {};
    const fFrom = parseDateOrNull(from);
    const fTo = parseDateOrNull(to);
    if (fFrom) createdAtMatch.$gte = fFrom;
    if (fTo) createdAtMatch.$lte = fTo;

    let deadlineMatch = null;
    const dFrom = parseDateOrNull(deadlineFrom);
    const dTo = parseDateOrNull(deadlineTo);
    if (dFrom || dTo) {
      deadlineMatch = {};
      if (dFrom) deadlineMatch.$gte = dFrom;
      if (dTo) deadlineMatch.$lte = dTo;
    }

    const maxDays = Math.min(30, Math.max(0, parseInt(uptoDays, 10) || 30));
    const thresholds = [0, 1, 2, 3, 7, 14, 30];

    /* ---------- pipeline ---------- */
    const pipeline = [];

    // date filters (createdAt)
    if (Object.keys(createdAtMatch).length) pipeline.push({ $match: { createdAt: createdAtMatch } });

    // require a deadline, optional deadline range
    const deadlineFilter = { deadline: { $type: "date" } };
    if (deadlineMatch) deadlineFilter.deadline = { ...deadlineFilter.deadline, ...deadlineMatch };
    pipeline.push({ $match: deadlineFilter });

    // subtask creators (for ACL like your other endpoints)
    pipeline.push({
      $addFields: {
        subtask_creator_ids: {
          $map: {
            input: { $ifNull: ["$sub_tasks", []] },
            as: "st",
            in: { $ifNull: ["$$st.createdBy", null] },
          },
        },
      },
    });

    // lookups for ACL scoping
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy_info",
        },
      },
      { $unwind: { path: "$createdBy_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to_users",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "subtask_creator_ids",
          foreignField: "_id",
          as: "subtask_creators",
        },
      }
    );

    // ACL for regular users
    if (!isPrivileged && userRole !== "manager") {
      pipeline.push({
        $match: {
          $or: [
            { createdBy: safeObjectId(currentUserId) },
            { subtask_creator_ids: safeObjectId(currentUserId) },
            { assigned_to: safeObjectId(currentUserId) },
          ],
        },
      });
    }

    // Manager department scope (creator/assignees/subtask creators)
    if (userRole === "manager") {
      let effectiveDept = currentUser?.department || "";
      const camNames = new Set(["Sushant Ranjan Dubey", "Sanjiv Kumar"]);
      if (camNames.has(String(currentUser?.name || ""))) effectiveDept = "CAM Team";

      if (effectiveDept) {
        pipeline.push({
          $match: {
            $or: [
              { "createdBy_info.department": effectiveDept },
              { "assigned_to_users.department": effectiveDept },
              { "subtask_creators.department": effectiveDept },
            ],
          },
        });
      }
    }

    // normalize status & compute days between createdAt and deadline
    pipeline.push(
      {
        $addFields: {
          statusLower: { $toLower: { $ifNull: ["$current_status.status", ""] } },
          ageDaysRaw: {
            $dateDiff: { startDate: "$createdAt", endDate: "$deadline", unit: "day" },
          },
        },
      },
      // clamp negatives to 0, map "in progress" & "draft" → "pending"
      {
        $addFields: {
          ageDays: {
            $cond: [{ $lt: ["$ageDaysRaw", 0] }, 0, "$ageDaysRaw"],
          },
          normStatus: {
            $switch: {
              branches: [
                { case: { $eq: ["$statusLower", "in progress"] }, then: "pending" },
                { case: { $eq: ["$statusLower", "draft"] }, then: "pending" },
              ],
              default: "$statusLower",
            },
          },
        },
      },
      // keep within the selected "up to" window
      { $match: { ageDays: { $lte: maxDays } } },
      // bucketize to [0,1,2,3,7,14,30]
      {
        $addFields: {
          bucket: {
            $switch: {
              branches: [
                { case: { $lte: ["$ageDays", 0] }, then: 0 },
                { case: { $lte: ["$ageDays", 1] }, then: 1 },
                { case: { $lte: ["$ageDays", 2] }, then: 2 },
                { case: { $lte: ["$ageDays", 3] }, then: 3 },
                { case: { $lte: ["$ageDays", 7] }, then: 7 },
                { case: { $lte: ["$ageDays", 14] }, then: 14 },
              ],
              default: 30,
            },
          },
        },
      },
      // group into per-bucket status tallies
      {
        $group: {
          _id: "$bucket",
          completed: { $sum: { $cond: [{ $eq: ["$normStatus", "completed"] }, 1, 0] } },
          pending:   { $sum: { $cond: [{ $eq: ["$normStatus", "pending"] },   1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$normStatus", "cancelled"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } }
    );

    const raw = await tasksModells.aggregate(pipeline);

    // Fill missing buckets with zeros
    const zeros = { completed: 0, pending: 0, cancelled: 0 };
    const statsByBucket = {};
    thresholds
      .filter((t) => t <= maxDays || t === 30) // keep usual keys; frontend can ignore > maxDays
      .forEach((t) => {
        const hit = raw.find((r) => Number(r._id) === Number(t));
        statsByBucket[t] = hit
          ? { completed: hit.completed, pending: hit.pending, cancelled: hit.cancelled }
          : { ...zeros };
      });

    // labels for convenience
    const labels = {
      0: "Same day",
      1: "1 day",
      2: "2 days",
      3: "3 days",
      7: "7 days",
      14: "14 days",
      30: "30 days",
    };

    // totals
    const totals = Object.values(statsByBucket).reduce(
      (acc, b) => ({
        completed: acc.completed + b.completed,
        pending: acc.pending + b.pending,
        cancelled: acc.cancelled + b.cancelled,
      }),
      { completed: 0, pending: 0, cancelled: 0 }
    );

    return res.status(200).json({
      uptoDays: maxDays,
      order: thresholds,
      labels,
      statsByBucket,
      totals,
      filters: {
        from: fFrom || null,
        to: fTo || null,
        deadlineFrom: dFrom || null,
        deadlineTo: dTo || null,
      },
    });
  } catch (err) {
    console.error("getAgingByResolution error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
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
  createSubTask,
  //Task Dashboard
  taskCards,
  myTasks,
  activityFeed,
  getUserPerformance,
  getProjectsByState,
  getAgingByResolution
};
