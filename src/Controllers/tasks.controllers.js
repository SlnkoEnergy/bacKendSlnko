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
      { $unwind: { path: "$createdBy_info", preserveNullAndEmptyArrays: true } },

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
            { $match: { $expr: { $in: ["$_id", { $ifNull: ["$$ids", []] }] } } },
            { $project: { _id: 1, name: 1, department: 1 } },
          ],
          as: "sub_assignees",
        },
      }
    );

    const postLookupMatch = [];

    // ---- Hide statuses (optional flags) ----
    const hideStatuses = [];
    if (hide_completed === "true")  hideStatuses.push("completed");
    if (hide_pending === "true")    hideStatuses.push("pending");
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
      if (to)   range.$lt  = nextDayStart(to);
      postLookupMatch.push({ createdAt: range });
    }

    // ---- DEADLINE RANGE ----
    if (deadlineFrom || deadlineTo) {
      const dl = {};
      if (deadlineFrom) dl.$gte = startOfDay(deadlineFrom);
      if (deadlineTo)   dl.$lt  = nextDayStart(deadlineTo);
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
        return res.status(400).json({ message: "Invalid createdById provided." });
      }
      postLookupMatch.push({ createdBy: cOID });
    }

    if (assignedToId) {
      let aOID;
      try {
        aOID = new mongoose.Types.ObjectId(String(assignedToId));
      } catch (e) {
        return res.status(400).json({ message: "Invalid assignedToId provided." });
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
        priorities = priorityFilter.split(/[,\s]+/).filter(Boolean).map(String);
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

      const camOverrideNames = new Set(["Sushant Ranjan Dubey", "Sanjiv Kumar"]);
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
              in: { _id: "$$proj._id", code: "$$proj.code", name: "$$proj.name" },
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
              in: { _id: "$$s._id", name: "$$s.name", department: "$$s.department" },
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

// small helpers
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
      return res
        .status(401)
        .json({ message: "Unauthorized: Invalid user." });
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
      createdByID,
      assignedToId,
      assignedToID,
      // match mode: "all" (AND) | "any" (OR)
      mode = "all",
      // optional hide flags (if you want to mirror list)
      hide_completed,
      hide_pending,
      hide_inprogress,
      status = "", // optional: filter a specific status
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
    const effectiveAssignedToId = assignedToId || assignedToID;
    const effectiveCreatedById = createdById || createdByID;

    if (effectiveAssignedToId) {
      const aOID = safeObjectId(effectiveAssignedToId);
      if (!aOID) {
        return res
          .status(400)
          .json({ message: "Invalid assignedToId provided." });
      }
      // NOTE: for arrays, {$in: [id]} works; avoid $elemMatch with $in
      matchBlocks.push({
        $or: [{ assigned_to: { $in: [aOID] } }, { "sub_tasks.assigned_to": { $in: [aOID] } }],
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
        $or: [{ createdBy: { $in: [cOID] } }, { "sub_tasks.createdBy": { $in: [cOID] } }],
      });
    }

    // ---- status filter (optional) ----
    if (status) {
      matchBlocks.push({ "current_status.status": status });
    }

    // ---- hide flags (optional) ----
    const hideStatuses = [];
    if (hide_completed === "true") hideStatuses.push("completed");
    if (hide_pending === "true") hideStatuses.push("pending");
    if (hide_inprogress === "true") hideStatuses.push("in progress");
    if (hideStatuses.length > 0) {
      matchBlocks.push({ "current_status.status": { $nin: hideStatuses } });
    }

    // ---- access control (pre lookup) ----
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
      { $unwind: { path: "$createdBy_info", preserveNullAndEmptyArrays: true } },

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
    const result =
      agg[0] || {
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
    const tasks = await tasksModells
      .find(match)
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
    const cancelledTasks = await tasksModells
      .find(match)
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
    const tasksToday = await tasksModells
      .find(match)
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
};

const myOverdueWorkItems = async (req, res) => {
  try {
    const { department, member } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let match = {
      deadline: { $lt: today },
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

    // Fetch overdue tasks
    const tasks = await tasksModells
      .find(match)
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
      counts.pending + counts.inprogress + counts.completed + counts.cancelled;

    return res.status(200).json({
      total,
      ...counts,
    });
  } catch (error) {
    console.error("taskStatusFunnel error:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
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
  myCancelled,
  myWorkItemsToday,
  myOverdueWorkItems,
  taskStatusFunnel,
};
