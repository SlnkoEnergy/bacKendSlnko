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
      // enforce manager department after lookups
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
      // main assignees -> need department (and later we will project attachment_url)
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to",
        },
      },
      // createdBy with department (keep full doc; project later)
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

      // ==== look up all comment authors ====
      {
        $lookup: {
          from: "users",
          localField: "comments.user_id",
          foreignField: "_id",
          as: "comment_users",
        },
      },

      // ---- FLATTEN sub_tasks.assigned_to safely into IDs array ----
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

      // lookup those sub_assignee_ids into user docs to get department + attachment_url
      {
        $lookup: {
          from: "users",
          let: { ids: "$sub_assignee_ids" },
          pipeline: [
            {
              $match: { $expr: { $in: ["$_id", { $ifNull: ["$$ids", []] }] } },
            },
            { $project: { _id: 1, name: 1, department: 1, attachment_url: 1 } },
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

    // ---- Status filter ----
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

    // ---- createdById / assignedToId ----
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

    // ---- MANAGER RULE: same dept (CAM Team override) ----
    if (userRole === "manager") {
      let effectiveDept = currentUser?.department || "";
      const camOverride = new Set(["Sushant Ranjan Dubey", "Sanjiv Kumar"]);
      if (camOverride.has(String(currentUser?.name || ""))) {
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

    // ---- OUTPUT (include attachment_url on users) ----
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
          followers: 1,
          sub_tasks: 1,

          // map project details
          project_details: {
            $map: {
              input: { $ifNull: ["$project_details", []] },
              as: "proj",
              in: {
                _id: "$$proj._id",
                code: "$$proj.code",
                name: "$$proj.name",
              },
            },
          },

          // map assigned_to users (now with attachment_url)
          assigned_to: {
            $map: {
              input: { $ifNull: ["$assigned_to", []] },
              as: "user",
              in: {
                _id: "$$user._id",
                name: "$$user.name",
                department: "$$user.department",
                attachment_url: { $ifNull: ["$$user.attachment_url", ""] },
              },
            },
          },

          // createdBy info (now with attachment_url)
          createdBy: {
            _id: "$createdBy_info._id",
            name: "$createdBy_info.name",
            attachment_url: {
              $ifNull: ["$createdBy_info.attachment_url", ""],
            },
          },

          // sub assignees (with attachment_url from lookup pipeline)
          sub_assignees: {
            $map: {
              input: { $ifNull: ["$sub_assignees", []] },
              as: "s",
              in: {
                _id: "$$s._id",
                name: "$$s.name",
                department: "$$s.department",
                attachment_url: { $ifNull: ["$$s.attachment_url", ""] },
              },
            },
          },

          // comments enriched with user { _id, name, attachment_url }
          comments: {
            $map: {
              input: { $ifNull: ["$comments", []] },
              as: "c",
              in: {
                _id: "$$c._id",
                remarks: "$$c.remarks",
                updatedAt: "$$c.updatedAt",
                user: {
                  _id: "$$c.user_id",
                  name: {
                    $let: {
                      vars: {
                        match: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: { $ifNull: ["$comment_users", []] },
                                as: "u",
                                cond: { $eq: ["$$u._id", "$$c.user_id"] },
                              },
                            },
                            0,
                          ],
                        },
                      },
                      in: { $ifNull: ["$$match.name", ""] },
                    },
                  },
                  attachment_url: {
                    $let: {
                      vars: {
                        match: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: { $ifNull: ["$comment_users", []] },
                                as: "u",
                                cond: { $eq: ["$$u._id", "$$c.user_id"] },
                              },
                            },
                            0,
                          ],
                        },
                      },
                      in: { $ifNull: ["$$match.attachment_url", ""] },
                    },
                  },
                },
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
      .populate("assigned_to", "_id name attachment_url")
      .populate("createdBy", "_id name attachment_url")
      .populate("project_id", "code name attachment_url")
      .populate("current_status.user_id", "_id name attachment_url")
      .populate("status_history.user_id", "_id name  attachment_url")
       .populate("comments.user_id", "_id name attachment_url")
      .populate("attachments.user_id", "_id name attachment_url")
      .populate("followers", "_id name attachment_url")
      .populate("sub_tasks.assigned_to", "_id name attachment_url")
      .populate("sub_tasks.createdBy", "_id name attachment_url");
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

const escRx = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parseDateOrNull = (v) => {
  try {
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
};
// put near the top of the file
const absUrl = (req, p = "") => {
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const origin = `${req.protocol}://${req.get("host")}`;
  const path = p.startsWith("/") ? p : `/${p}`;
  return origin + path;
};
/* ---------- controller ---------- */
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
          active: "$in_progress",
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
      assignedToId,
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

    let deadlineMatch = null;
    if (deadlineFrom || deadlineTo) {
      deadlineMatch = {};
      if (deadlineFrom) deadlineMatch.$gte = new Date(deadlineFrom);
      if (deadlineTo) deadlineMatch.$lte = new Date(deadlineTo);
    }

    const createdByIds = createdById ? parseCsvObjectIds(createdById) : [];
    const assignedToIds = assignedToId ? parseCsvObjectIds(assignedToId) : [];
    const deptList = parseCsv(departments);

    const pipeline = [{ $match: { createdAt: createdAtMatch } }];
    if (deadlineMatch) pipeline.push({ $match: { deadline: deadlineMatch } });

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

    if (!isPrivileged && userRole !== "manager") {
      pipeline.push({
        $match: {
          $or: [
            { createdBy: safeObjectId(currentUserId) },
            { subtask_creator_ids: safeObjectId(currentUserId) },
            { followers: currentUser._id },
          ],
        },
      });
    }

    if (assignedToIds.length) {
      pipeline.push({
        $match: {
          assigned_to: { $in: assignedToIds },
        },
      });
    }

    // Lookups
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

    if (createdByIds.length) {
      pipeline.push({ $match: { createdBy: { $in: createdByIds } } });
    }

    if (deptList.length) {
      pipeline.push({
        $match: { "createdBy_info.department": { $in: deptList } },
      });
    }

    // Derive names + keep IDs & attachment URLs for creator and assignees
    pipeline.push({
      $addFields: {
        createdbyname: "$createdBy_info.name",
        createdby_id: "$createdBy_info._id",
        createdby_attachment_url: {
          $ifNull: ["$createdBy_info.attachment_url", "$createdBy_info.avatar"],
        },

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

    // Final projection including attachment_url for assignees
    pipeline.push({
      $project: {
        _id: 1,
        createdAt: 1,
        deadline: 1,
        "current_status.status": 1,

        createdby_id: 1,
        createdbyname: 1,
        createdby_attachment_url: 1,

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

        // include attachment_url for each assignee (fallback to avatar)
        assigned_to: {
          $map: {
            input: { $ifNull: ["$assigned_to_users", []] },
            as: "u",
            in: {
              _id: "$$u._id",
              name: "$$u.name",
              attachment_url: {
                $ifNull: ["$$u.attachment_url", "$$u.avatar"],
              },
            },
          },
        },

        // (kept for any legacy UI string rendering)
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

        taskname: {
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

    // Shape for UI — include full creator object + absolute URLs
    const data = rows.map((t) => ({
      id: t._id,
      title: t.taskname,
      time: formatIST_HHMM(t.createdAt),
      deadline: t.deadline || null,
      current_status: { status: t?.["current_status"]?.status || "—" },

      created_by: {
        _id: t.createdby_id || null,
        user_id: t.createdby_id || null, // convenience alias if you need it
        name: t.createdbyname || "—",
        attachment_url: absUrl(req, t.createdby_attachment_url || ""),
      },

      subtask_createdby: t.subtask_createdby || "",

      assigned_to: (t.assigned_to || []).map((u) => ({
        _id: u._id,
        name: u.name,
        attachment_url: absUrl(req, u.attachment_url || ""),
      })),
    }));

    return res.status(200).json({
      filters: {
        from: customFrom || null,
        to: customTo || null,
        deadlineFrom: deadlineFrom || null,
        deadlineTo: deadlineTo || null,
        departments: deptList,
        createdById: createdByIds,
        assignedToId: assignedToIds,
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

    if (!isPrivileged && userRole !== "manager") {
      pipeline.push({
        $match: {
          $or: [
            { createdBy: safeObjectId(currentUserId) },
            { subtask_creator_ids: safeObjectId(currentUserId) },
            { followers: currentUser._id },
          ],
        },
      });
    }

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

    pipeline.push({
      $match: {
        comments: { $exists: true, $ne: [] },
      },
    });

    pipeline.push(
      { $unwind: "$comments" },
      { $sort: { "comments.updatedAt": -1 } },
      { $limit: 100 }
    );

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

    pipeline.push({
      $project: {
        task_id: "$_id",
        taskCode: "$taskCode",
        comment_id: "$comments._id",
        remarks: "$comments.remarks",
        updatedAt: "$comments.updatedAt",
        commenter_name: "$comment_user.name",
        commenter_attachment_url: {
          $ifNull: ["$comment_user.attachment_url", "$comment_user.avatar"],
        },
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

    const data = rows.map((r) => ({
      id: r.comment_id,
      task_id: r.task_id,
      task_code: r.taskCode,
      name: r.commenter_name || "—",
      // provide both for compatibility; UI can use attachment_url
      attachment_url: absUrl(req, r.commenter_attachment_url || ""),
      avatar: absUrl(req, r.commenter_attachment_url || ""),
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


const getUserPerformance = async (req, res) => {
  try {
    const {
      userId,
      name,
      q,
      from,
      to,
      deadlineFrom,
      deadlineTo,
      includeSubtasks = "true",
    } = req.query;

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

    const ARRIFY = (fieldExpr) => ({
      $let: {
        vars: { a: fieldExpr },
        in: {
          $cond: [
            { $isArray: "$$a" },
            "$$a",
            { $cond: [{ $eq: ["$$a", null] }, [], ["$$a"]] },
          ],
        },
      },
    });

    /* ===== SINGLE USER ===== */
    if (userId || (name ?? q)) {
      let targetUser, targetUserId;

      if (userId) {
        targetUserId = safeObjectId(userId);
        if (!targetUserId)
          return res.status(400).json({ message: "Invalid userId" });
        targetUser = await User.findById(targetUserId)
          .select("name attachment_url avatar department")
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
        targetUser = await User.findOne({ name: rx })
          .select("name attachment_url avatar department")
          .lean();
        if (!targetUser) {
          return res
            .status(404)
            .json({ message: "No user matched the provided name" });
        }
        targetUserId = targetUser._id;
      }

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

      pipeline.push({
        $addFields: {
          assigned_to_arr: ARRIFY("$assigned_to"),
        },
      });

      pipeline.push({
        $addFields: {
          sub_assignee_ids: {
            $reduce: {
              input: { $ifNull: ["$sub_tasks", []] },
              initialValue: [],
              in: {
                $setUnion: [ "$$value", ARRIFY("$$this.assigned_to") ],
              },
            },
          },
        },
      });

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
            localField: "assigned_to_arr",
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

      pipeline.push({
        $addFields: {
          isAssignedTask: {
            $in: [targetUserId, { $ifNull: ["$assigned_to_arr", []] }],
          },
          isAssignedSubtask: wantsSubtasks
            ? { $in: [targetUserId, { $ifNull: ["$sub_assignee_ids", []] }] }
            : false,
        },
      });

      pipeline.push(
        { $addFields: { isAssigned: { $or: ["$isAssignedTask", "$isAssignedSubtask"] } } },
        { $match: { isAssigned: true } }
      );

      pipeline.push(
        {
          $addFields: {
            statusLower: { $toLower: { $ifNull: ["$current_status.status", ""] } },
            hasDeadline: { $cond: [{ $ifNull: ["$deadline", false] }, true, false] },
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

      pipeline.push({
        $group: {
          _id: null,
          assigned: { $sum: 1 },
          completed: { $sum: { $cond: ["$isCompleted", 1, 0] } },
          delayed: { $sum: { $cond: ["$isDelayed", 1, 0] } },

          taskAssigned: { $sum: { $cond: ["$isAssignedTask", 1, 0] } },
          taskCompleted: { $sum: { $cond: [{ $and: ["$isAssignedTask", "$isCompleted"] }, 1, 0] } },
          taskDelayed:   { $sum: { $cond: [{ $and: ["$isAssignedTask", "$isDelayed"] }, 1, 0] } },

          subAssigned: { $sum: { $cond: ["$isAssignedSubtask", 1, 0] } },
          subCompleted:{ $sum: { $cond: [{ $and: ["$isAssignedSubtask", "$isCompleted"] }, 1, 0] } },
          subDelayed:  { $sum: { $cond: [{ $and: ["$isAssignedSubtask", "$isDelayed"] }, 1, 0] } },
        },
      });

      const agg = await tasksModells.aggregate(pipeline);
      const g = agg?.[0] || {
        assigned: 0, completed: 0, delayed: 0,
        taskAssigned: 0, taskCompleted: 0, taskDelayed: 0,
        subAssigned: 0, subCompleted: 0, subDelayed: 0,
      };
      const completionPct = g.assigned > 0 ? Number(((g.completed / g.assigned) * 100).toFixed(2)) : 0;

      const userDoc =
        targetUser ||
        (await User.findById(targetUserId)
          .select("name attachment_url avatar department")
          .lean());

      return res.status(200).json({
        mode: "single",
        user: {
          _id: userDoc?._id || targetUserId,
          name: userDoc?.name || "",
          department: userDoc?.department || "",
          attachment_url: absUrl(req, userDoc?.attachment_url || userDoc?.avatar || ""),
          // keep avatar for any legacy UI that still reads it
          avatar: absUrl(req, userDoc?.attachment_url || userDoc?.avatar || ""),
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

    /* ===== LIST (ALL USERS) ===== */
    const pipeline = [];

    if (Object.keys(createdAtMatch).length)
      pipeline.push({ $match: { createdAt: createdAtMatch } });
    if (deadlineMatch) pipeline.push({ $match: { deadline: deadlineMatch } });

    pipeline.push({ $addFields: { assigned_to_arr: ARRIFY("$assigned_to") } });

    pipeline.push({
      $addFields: {
        sub_assignee_ids: {
          $reduce: {
            input: { $ifNull: ["$sub_tasks", []] },
            initialValue: [],
            in: { $setUnion: ["$$value", ARRIFY("$$this.assigned_to")] },
          },
        },
      },
    });

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
          localField: "assigned_to_arr",
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

    pipeline.push(
      {
        $addFields: {
          statusLower: { $toLower: { $ifNull: ["$current_status.status", ""] } },
          hasDeadline: { $cond: [{ $ifNull: ["$deadline", false] }, true, false] },
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

    pipeline.push({
      $addFields: {
        union_assignees: String(includeSubtasks) !== "false"
          ? { $setUnion: [{ $ifNull: ["$assigned_to_arr", []] }, { $ifNull: ["$sub_assignee_ids", []] }] }
          : { $ifNull: ["$assigned_to_arr", []] },
      },
    });

    pipeline.push({ $unwind: { path: "$union_assignees", preserveNullAndEmptyArrays: false } });

    pipeline.push({
      $addFields: {
        assigneeId: "$union_assignees",
        isAssignedTaskUser: { $in: ["$union_assignees", { $ifNull: ["$assigned_to_arr", []] }] },
        isAssignedSubtaskUser: String(includeSubtasks) !== "false"
          ? { $in: ["$union_assignees", { $ifNull: ["$sub_assignee_ids", []] }] }
          : false,
      },
    });

    if (!isPrivileged && userRole !== "manager") {
      pipeline.push({ $match: { assigneeId: safeObjectId(currentUserId) } });
    }

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
      if (effectiveDept)
        pipeline.push({ $match: { "u.department": effectiveDept } });
    }

    pipeline.push({
      $group: {
        _id: "$assigneeId",
        name: { $first: "$u.name" },
        // collect attachment_url (fallback to avatar)
        attachment_url: { $first: { $ifNull: ["$u.attachment_url", "$u.avatar"] } },
        department: { $first: "$u.department" },

        assigned: { $sum: 1 },
        completed: { $sum: { $cond: ["$isCompleted", 1, 0] } },
        delayed: { $sum: { $cond: ["$isDelayed", 1, 0] } },

        taskAssigned: { $sum: { $cond: ["$isAssignedTaskUser", 1, 0] } },
        taskCompleted: { $sum: { $cond: [{ $and: ["$isAssignedTaskUser", "$isCompleted"] }, 1, 0] } },
        taskDelayed:   { $sum: { $cond: [{ $and: ["$isAssignedTaskUser", "$isDelayed"] }, 1, 0] } },

        subAssigned: { $sum: { $cond: ["$isAssignedSubtaskUser", 1, 0] } },
        subCompleted:{ $sum: { $cond: [{ $and: ["$isAssignedSubtaskUser", "$isCompleted"] }, 1, 0] } },
        subDelayed:  { $sum: { $cond: [{ $and: ["$isAssignedSubtaskUser", "$isDelayed"] }, 1, 0] } },
      },
    });

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
        department: r.department || "",
        attachment_url: absUrl(req, r.attachment_url || ""),
        // keep legacy key if something still uses it
        avatar: absUrl(req, r.attachment_url || ""),
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

    // --- requester
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

    // --- dates
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

    // small helper to coerce any value to an array
    const ARRIFY = (expr) => ({
      $let: {
        vars: { a: expr },
        in: {
          $cond: [
            { $isArray: "$$a" },
            "$$a",
            { $cond: [{ $eq: ["$$a", null] }, [], ["$$a"]] },
          ],
        },
      },
    });

    const pipeline = [];

    if (Object.keys(createdAtMatch).length)
      pipeline.push({ $match: { createdAt: createdAtMatch } });
    if (deadlineMatch) pipeline.push({ $match: { deadline: deadlineMatch } });

    // Normalize top-level assigned_to and project_id to arrays
    pipeline.push({
      $addFields: {
        assigned_to_arr: ARRIFY("$assigned_to"),
        project_ids_arr: ARRIFY("$project_id"),
      },
    });

    // Collect normalized subtask assignees (avoid ObjectId vs array problems)
    pipeline.push({
      $addFields: {
        sub_assignee_ids: {
          $reduce: {
            input: { $ifNull: ["$sub_tasks", []] },
            initialValue: [],
            in: {
              $setUnion: [
                "$$value",
                ARRIFY("$${this}.assigned_to".replace("${this}", "this")), // will be inlined below
              ],
            },
          },
        },
      },
    });
    // NOTE: some Node versions dislike the string replace above, so use this
    // version instead if you prefer explicit expression:
    pipeline[
      pipeline.length - 1
    ].$addFields.sub_assignee_ids.$reduce.in.$setUnion[1] =
      ARRIFY("$$this.assigned_to");

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
          localField: "assigned_to_arr", // use normalized
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
    const me = safeObjectId(currentUserId);
    if (!isPrivileged && userRole !== "manager") {
      pipeline.push({
        $match: {
          $or: [
            { createdBy: me },
            { assigned_to_arr: me }, // membership on normalized array
            { sub_assignee_ids: me }, // membership on array
            { followers: me }, // <- include followers as requested
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

    // Only tasks with any project(s)
    pipeline.push({ $match: { project_ids_arr: { $ne: [] } } });

    // Unwind normalized project IDs and join to read state
    pipeline.push(
      { $unwind: "$project_ids_arr" },
      {
        $lookup: {
          from: "projectdetails", // collection for model projectDetail
          localField: "project_ids_arr",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: false } },
      { $match: { "project.state": { $exists: true, $ne: null, $ne: "" } } }
    );

    // Count UNIQUE projects per state
    pipeline.push({
      $group: {
        _id: "$project.state",
        projects: { $addToSet: "$project._id" },
      },
    });

    // Turn set size into count
    pipeline.push({
      $project: {
        _id: 0,
        state: "$_id",
        count: { $size: "$projects" },
      },
    });

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
      distribution,
      labels: distribution.map((d) => d.state),
      series: distribution.map((d) => d.pct),
      counts: distribution.map((d) => d.count),
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
    const { from, to, deadlineFrom, deadlineTo, uptoDays = "30" } = req.query;

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
    if (Object.keys(createdAtMatch).length)
      pipeline.push({ $match: { createdAt: createdAtMatch } });

    // require a deadline, optional deadline range
    const deadlineFilter = { deadline: { $type: "date" } };
    if (deadlineMatch)
      deadlineFilter.deadline = {
        ...deadlineFilter.deadline,
        ...deadlineMatch,
      };
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
            { followers: currentUser._id },
          ],
        },
      });
    }

    // Manager department scope (creator/assignees/subtask creators)
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
          statusLower: {
            $toLower: { $ifNull: ["$current_status.status", ""] },
          },
          ageDaysRaw: {
            $dateDiff: {
              startDate: "$createdAt",
              endDate: "$deadline",
              unit: "day",
            },
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
                {
                  case: { $eq: ["$statusLower", "in progress"] },
                  then: "pending",
                },
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
          completed: {
            $sum: { $cond: [{ $eq: ["$normStatus", "completed"] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$normStatus", "pending"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$normStatus", "cancelled"] }, 1, 0] },
          },
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
          ? {
              completed: hit.completed,
              pending: hit.pending,
              cancelled: hit.cancelled,
            }
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
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
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
  getAgingByResolution,
};
