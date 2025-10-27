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
    res.status(500).json({ error: err.message });
  }
};

// --- helpers / config ---
const norm = (s = "") => String(s).trim().toLowerCase();

// Map: manager -> people they can see
const VISIBILITY_MATRIX = [
  ["rahul kushwaha", ["izhan mustafa", "rajhans prasad", "subhadra chandel"]],
  ["saresh kumar", ["ritesh kumar mishra", "vasu bhardwaj", "shivam kumar"]],
  ["ashish kumar", ["ribha kumari", "ayush dwivedi", "aditya kashyap"]],
];

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
      visibleUsers = "",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const searchRegex = new RegExp(search, "i");

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

    // ---------- delegated people resolution ----------
    const currentNameLc = norm(currentUser?.name);
    const matrixRow = VISIBILITY_MATRIX.find(([mgr]) => norm(mgr) === currentNameLc);
    const matrixNames = matrixRow ? matrixRow[1] : [];

    const adHocNames = String(visibleUsers)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const delegatedNamesLcSet = new Set([...matrixNames, ...adHocNames].map((n) => norm(n)));

    let delegatedUserIds = [];
    if (delegatedNamesLcSet.size > 0) {
      const nameRegexes = Array.from(delegatedNamesLcSet).map(
        (n) => new RegExp(`^${escRx(n)}$`, "i")
      );
      const delegates = await User.find({ name: { $in: nameRegexes } })
        .select("_id name")
        .lean();
      delegatedUserIds = delegates.map((u) => u._id);
    }

    // ---------- full access? ----------
    const isFullAccess =
      currentUser.emp_id === "SE-013" ||
      userRole === "admin" ||
      userRole === "superadmin";

    // ---------- base pipeline ----------
    const basePipeline = [];

    // 🚫 REMOVE the early visibility gate here (it blocks managers)
    // if (!isFullAccess) { basePipeline.push({ $match: { ... } }); } // <<< REMOVED

    basePipeline.push({ $addFields: { __currentUserId: currentUser._id } });

    // lookups
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
          as: "assigned_to_users",
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
      { $unwind: { path: "$createdBy_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "comments.user_id",
          foreignField: "_id",
          as: "comment_users",
        },
      },
      // collect subtask ids for further lookups
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
          subtask_creator_ids: {
            $map: {
              input: { $ifNull: ["$sub_tasks", []] },
              as: "st",
              in: { $ifNull: ["$$st.createdBy", null] },
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          let: { ids: "$sub_assignee_ids" },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", { $ifNull: ["$$ids", []] }] } } },
            { $project: { _id: 1, name: 1, department: 1, attachment_url: 1 } },
          ],
          as: "sub_assignees",
        },
      },
      {
        $lookup: {
          from: "users",
          let: { ids: "$subtask_creator_ids" },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", { $ifNull: ["$$ids", []] }] } } },
            { $project: { _id: 1, name: 1, department: 1, attachment_url: 1 } },
          ],
          as: "subtask_creators",
        },
      }
    );

    // ✅ Final, single visibility gate AFTER lookups (key fix)
    if (!isFullAccess) {
      const ownVisibility = {
        $or: [
          { createdBy: currentUser._id },
          { followers: currentUser._id },
          { assigned_to: currentUser._id },
          { "sub_tasks.assigned_to": currentUser._id },
        ],
      };

      const delegatedVisibility =
        delegatedUserIds.length > 0
          ? {
            $or: [
              { createdBy: { $in: delegatedUserIds } },
              { assigned_to: { $in: delegatedUserIds } },
              { "sub_tasks.assigned_to": { $in: delegatedUserIds } },
            ],
          }
          : null;

      // Department list for manager/visitor
      let deptVisibility = null;
      if (userRole === "manager" || userRole === "visitor") {
        const nameLc = norm(currentUser?.name || "");
        const camOverrideNames = new Set(["sushant ranjan dubey", "sanjiv kumar"]);
        let deptList = [];

        if (camOverrideNames.has(nameLc)) {
          deptList = ["CAM", "Projects"];
        } else if (userRole === "visitor") {
          deptList = ["Projects", "CAM"];
        } else if (currentUser?.department) {
          deptList = [currentUser.department];
        }

        if (deptList.length > 0) {
          const deptRegexes = deptList.map((d) => new RegExp(`${escRx(d)}`, "i"));
          // IMPORTANT: make this an OR, so department can EXPAND visibility
          deptVisibility = {
            $or: [
              { "createdBy_info.department": { $in: deptRegexes } },
              { "assigned_to_users.department": { $in: deptRegexes } },
              { "sub_assignees.department": { $in: deptRegexes } },
            ],
          };
        }
      }

      const visibilityOr = [ownVisibility];
      if (delegatedVisibility) visibilityOr.push(delegatedVisibility);
      if (deptVisibility) visibilityOr.push(deptVisibility);

      basePipeline.push({ $match: { $or: visibilityOr } }); // <<< CHANGED (moved after lookups & OR-ed)
    }

    // ---- POST LOOKUP FILTERS (user-requested filters only) ----
    const postLookupMatch = [];

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

    if (status) postLookupMatch.push({ "current_status.status": status });

    if (from || to) {
      const range = {};
      if (from) range.$gte = startOfDay(from);
      if (to) range.$lt = nextDayStart(to);
      postLookupMatch.push({ createdAt: range });
    }

    if (deadlineFrom || deadlineTo) {
      const dl = {};
      if (deadlineFrom) dl.$gte = startOfDay(deadlineFrom);
      if (deadlineTo) dl.$lt = nextDayStart(deadlineTo);
      postLookupMatch.push({ deadline: dl });
    }

    // keep explicit department filter param if UI sends it (this is a user filter)
    if (department) postLookupMatch.push({ "assigned_to_users.department": department });

    if (createdById) {
      let cOID;
      try {
        cOID = new mongoose.Types.ObjectId(String(createdById));
      } catch {
        return res.status(400).json({ message: "Invalid createdById provided." });
      }
      postLookupMatch.push({ createdBy: cOID });
    }

    if (assignedToId) {
      let aOID;
      try {
        aOID = new mongoose.Types.ObjectId(String(assignedToId));
      } catch {
        return res.status(400).json({ message: "Invalid assignedToId provided." });
      }
      postLookupMatch.push({
        $or: [
          { assigned_to: aOID },
          { "sub_tasks.assigned_to": aOID },
          { "assigned_to_users._id": aOID },
          { "sub_assignees._id": aOID },
        ],
      });
    }

    if (priorityFilter !== "" && priorityFilter !== undefined) {
      let priorities = [];
      if (Array.isArray(priorityFilter)) priorities = priorityFilter.map(String);
      else if (typeof priorityFilter === "string")
        priorities = priorityFilter.split(/[,\s]+/).filter(Boolean).map(String);
      else priorities = [String(priorityFilter)];

      priorities = priorities.filter((p) => ["1", "2", "3"].includes(p));
      if (priorities.length === 1) postLookupMatch.push({ priority: priorities[0] });
      else if (priorities.length > 1) postLookupMatch.push({ priority: { $in: priorities } });
    }

    if (postLookupMatch.length > 0) basePipeline.push({ $match: { $and: postLookupMatch } });

    // ---- Derive fields from the current user's subtask (unchanged) ----
    const dataPipeline = [
      ...basePipeline,
      {
        $addFields: {
          __mySubs: {
            $filter: {
              input: { $ifNull: ["$sub_tasks", []] },
              as: "st",
              cond: {
                $in: [
                  "$__currentUserId",
                  {
                    $cond: [
                      { $isArray: "$$st.assigned_to" },
                      "$$st.assigned_to",
                      {
                        $cond: [
                          { $ne: ["$$st.assigned_to", null] },
                          ["$$st.assigned_to"],
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
      {
        $addFields: {
          __myMinDl: {
            $cond: [
              { $gt: [{ $size: "$__mySubs" }, 0] },
              { $min: { $map: { input: "$__mySubs", as: "x", in: "$$x.deadline" } } },
              null,
            ],
          },
        },
      },
      {
        $addFields: {
          __mySub: {
            $let: {
              vars: {
                cand: {
                  $filter: {
                    input: "$__mySubs",
                    as: "s",
                    cond: { $eq: ["$$s.deadline", "$__myMinDl"] },
                  },
                },
              },
              in: { $arrayElemAt: ["$$cand", 0] },
            },
          },
        },
      },
      {
        $addFields: {
          deadline: { $ifNull: ["$__myMinDl", "$deadline"] },
          assigned_to: {
            $cond: [
              { $gt: [{ $size: "$__mySubs" }, 0] },
              {
                $map: {
                  input: {
                    $filter: {
                      input: { $ifNull: ["$sub_assignees", []] },
                      as: "u",
                      cond: {
                        $in: [
                          "$$u._id",
                          {
                            $cond: [
                              { $isArray: "$__mySub.assigned_to" },
                              "$__mySub.assigned_to",
                              {
                                $cond: [
                                  { $ne: ["$__mySub.assigned_to", null] },
                                  ["$__mySub.assigned_to"],
                                  [],
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    },
                  },
                  as: "au",
                  in: {
                    _id: "$$au._id",
                    name: "$$au.name",
                    department: "$$au.department",
                    attachment_url: { $ifNull: ["$$au.attachment_url", ""] },
                  },
                },
              },
              {
                $map: {
                  input: { $ifNull: ["$assigned_to_users", []] },
                  as: "user",
                  in: {
                    _id: "$$user._id",
                    name: "$$user.name",
                    department: "$$user.department",
                    attachment_url: { $ifNull: ["$$user.attachment_url", ""] },
                  },
                },
              },
            ],
          },
          createdBy: {
            $cond: [
              { $gt: [{ $size: "$__mySubs" }, 0] },
              {
                $let: {
                  vars: {
                    c: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: { $ifNull: ["$subtask_creators", []] },
                            as: "cu",
                            cond: { $eq: ["$$cu._id", "$__mySub.createdBy"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    _id: { $ifNull: ["$$c._id", "$__mySub.createdBy"] },
                    name: { $ifNull: ["$$c.name", ""] },
                    attachment_url: { $ifNull: ["$$c.attachment_url", ""] },
                  },
                },
              },
              {
                _id: "$createdBy_info._id",
                name: "$createdBy_info.name",
                attachment_url: { $ifNull: ["$createdBy_info.attachment_url", ""] },
              },
            ],
          },
        },
      },
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
          assigned_to: 1,
          createdBy: 1,
          project_details: {
            $map: {
              input: { $ifNull: ["$project_details", []] },
              as: "p",
              in: { _id: "$$p._id", code: "$$p.code", name: "$$p.name" },
            },
          },
          sub_tasks: {
            $map: {
              input: "$__mySubs",
              as: "st",
              in: {
                _id: "$$st._id",
                assigned_to: {
                  $map: {
                    input: {
                      $filter: {
                        input: { $ifNull: ["$sub_assignees", []] },
                        as: "u",
                        cond: {
                          $in: [
                            "$$u._id",
                            {
                              $cond: [
                                { $isArray: "$$st.assigned_to" },
                                "$$st.assigned_to",
                                {
                                  $cond: [
                                    { $ne: ["$$st.assigned_to", null] },
                                    ["$$st.assigned_to"],
                                    [],
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      },
                    },
                    as: "au",
                    in: {
                      _id: "$$au._id",
                      name: "$$au.name",
                      department: "$$au.department",
                      attachment_url: { $ifNull: ["$$au.attachment_url", ""] },
                    },
                  },
                },
                createdBy: {
                  $let: {
                    vars: {
                      c: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: { $ifNull: ["$subtask_creators", []] },
                              as: "cu",
                              cond: { $eq: ["$$cu._id", "$$st.createdBy"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      _id: { $ifNull: ["$$c._id", "$$st.createdBy"] },
                      name: { $ifNull: ["$$c.name", ""] },
                      attachment_url: { $ifNull: ["$$c.attachment_url", ""] },
                    },
                  },
                },
                deadline: "$$st.deadline",
                createdAt: "$$st.createdAt",
                updatedAt: "$$st.updatedAt",
              },
            },
          },
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
                        u: {
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
                      in: { $ifNull: ["$$u.name", ""] },
                    },
                  },
                  attachment_url: {
                    $let: {
                      vars: {
                        u: {
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
                      in: { $ifNull: ["$$u.attachment_url", ""] },
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
      delegatedViewOf: delegatedUserIds,
    });
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
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

    // ---- access (pre) ----
    const preAccess = [];
    if (
      currentUser.emp_id === "SE-013" ||
      userRole === "admin" ||
      userRole === "superadmin"
    ) {
      // full access
    } else if (userRole === "manager") {
      // department-based access will be enforced post-lookup
    } else if (userRole === "visitor") {
      // department-based access will be enforced post-lookup
    } else {
      // regular user: authored OR follower
      preAccess.push({
        $or: [{ createdBy: currentUser._id }, { followers: currentUser._id }],
      });
    }

    // ---- department UI filter (string / CSV). We'll enforce after lookups.
    const deptListFromUI = parseCsv(departments);

    // ---- assemble initial $match
    const firstMatch =
      preAccess.length || matchBlocks.length
        ? {
          $match:
            mode === "any"
              ? { $or: [...preAccess, ...matchBlocks] }
              : { $and: [...preAccess, ...matchBlocks] },
        }
        : { $match: {} };

    // ---- build pipeline
    const pipeline = [
      firstMatch,

      // main assignees (for department + manager/visitor rule)
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

    // ===== Manager / Visitor visibility by department =====
    if (userRole === "manager" || userRole === "visitor") {
      const nameLc = String(currentUser?.name || "")
        .trim()
        .toLowerCase();

      // override names → CAM (+ Projects)
      const camOverrideNames = new Set([
        "sushant ranjan dubey",
        "sanjiv kumar",
      ]);

      let effectiveDeptList = [];

      if (camOverrideNames.has(nameLc)) {
        effectiveDeptList = ["CAM", "Projects"];
      } else if (userRole === "visitor") {
        effectiveDeptList = ["Projects", "CAM"];
      } else {
        if (currentUser?.department)
          effectiveDeptList = [currentUser.department];
      }

      if (effectiveDeptList.length > 0) {
        // case-insensitive; for strict equality use ^...$ in the regex below
        const deptRegexes = effectiveDeptList.map(
          (d) => new RegExp(`${escRx(d)}`, "i")
          // strict: new RegExp(`^${escRx(d)}$`, "i")
        );

        pipeline.push({
          $match: {
            $or: [
              { "createdBy_info.department": { $in: deptRegexes } },
              { "assigned_to_users.department": { $in: deptRegexes } },
              { "sub_assignees.department": { $in: deptRegexes } },
            ],
          },
        });
      }
    }

    // ===== Department filter from UI (if any). Accept many names (regex, i) =====
    if (deptListFromUI.length > 0) {
      const uiDeptRegexes = deptListFromUI.map(
        (d) => new RegExp(`${escRx(d)}`, "i")
        // strict: new RegExp(`^${escRx(d)}$`, "i")
      );
      pipeline.push({
        $match: {
          $or: [
            { "createdBy_info.department": { $in: uiDeptRegexes } },
            { "assigned_to_users.department": { $in: uiDeptRegexes } },
            { "sub_assignees.department": { $in: uiDeptRegexes } },
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
        departments: deptListFromUI,
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
      // IGNORE these even if sent:
      // from, to, deadlineFrom, deadlineTo,
      departments = "",
      createdById,
      assignedToId,
      q,
    } = req.query;

    const currentUserId = req.user?.userId;
    const currentUser = await User.findById(currentUserId).lean();
    if (!currentUser)
      return res.status(404).json({ message: "User not found" });

    const userRole = String(currentUser?.role || "user").toLowerCase();
    const empId = currentUser?.emp_id;

    // ---- ALWAYS TODAY (IST) WINDOW ----
    const now = new Date();
    const istStartTodayUTC = getISTStartOfTodayUTC(now);
    const createdAtMatch = { $gte: istStartTodayUTC, $lte: now };

    // DO NOT filter by deadline range at all
    const createdByIds = createdById ? parseCsvObjectIds(createdById) : [];
    const assignedToIds = assignedToId ? parseCsvObjectIds(assignedToId) : [];
    const deptListFromUI = parseCsv(departments);

    const pipeline = [{ $match: { createdAt: createdAtMatch } }];

    // ---- subtask creator ids
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

    // ---- ACL for regular users (authored / subtask-authored / follower)
    if (
      userRole !== "admin" &&
      userRole !== "superadmin" &&
      userRole !== "manager" &&
      userRole !== "visitor" &&
      empId !== "SE-013"
    ) {
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

    // ---- filter by assignedToId at top-level (+ include subtasks' assignees)
    if (assignedToIds.length) {
      pipeline.push({
        $match: {
          $or: [
            { assigned_to: { $in: assignedToIds } },
            { "sub_tasks.assigned_to": { $in: assignedToIds } },
          ],
        },
      });
    }

    // ---- LOOKUPS
    pipeline.push(
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

      // subtask creators with department
      {
        $lookup: {
          from: "users",
          localField: "subtask_creator_ids",
          foreignField: "_id",
          as: "subtask_creators", // { _id, name, department }
        },
      },

      // main assignees with department
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to_users",
        },
      },

      // flatten sub_tasks.assigned_to -> sub_assignee_ids
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

      // lookup sub_assignees to get department
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

    // ===== Manager / Visitor visibility by department (with override)
    if (userRole === "manager" || userRole === "visitor") {
      const nameLc = String(currentUser?.name || "")
        .trim()
        .toLowerCase();
      const camOverrideNames = new Set([
        "sushant ranjan dubey",
        "sanjiv kumar",
      ]);

      let effectiveDeptList = [];
      if (camOverrideNames.has(nameLc)) {
        // override → CAM + Projects
        effectiveDeptList = ["CAM", "Projects"];
      } else if (userRole === "visitor") {
        // visitors see Projects + CAM
        effectiveDeptList = ["Projects", "CAM"];
      } else {
        // manager sees own department
        if (currentUser?.department)
          effectiveDeptList = [currentUser.department];
      }

      if (effectiveDeptList.length > 0) {
        const deptRegexes = effectiveDeptList.map(
          (d) => new RegExp(`${escRx(d)}`, "i")
        );
        pipeline.push({
          $match: {
            $or: [
              { "createdBy_info.department": { $in: deptRegexes } },
              { "assigned_to_users.department": { $in: deptRegexes } },
              { "sub_assignees.department": { $in: deptRegexes } },
              { "subtask_creators.department": { $in: deptRegexes } },
            ],
          },
        });
      }
    }

    // ---- Filter by creators (CSV)
    if (createdByIds.length) {
      pipeline.push({ $match: { createdBy: { $in: createdByIds } } });
    }

    // ===== Department filter from UI (CSV) — case-insensitive
    if (deptListFromUI.length) {
      const uiDeptRegexes = deptListFromUI.map(
        (d) => new RegExp(`${escRx(d)}`, "i")
      );
      pipeline.push({
        $match: {
          $or: [
            { "createdBy_info.department": { $in: uiDeptRegexes } },
            { "assigned_to_users.department": { $in: uiDeptRegexes } },
            { "sub_assignees.department": { $in: uiDeptRegexes } },
            { "subtask_creators.department": { $in: uiDeptRegexes } },
          ],
        },
      });
    }

    // ---- Search fields
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
            { assigned_to_names: rx },
          ],
        },
      });
    }

    // ---- Projection
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
        createdby_id: 1,
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
        assigned_to: 1,
        assigned_to_names: 1,
      },
    });

    // ---- Execute
    const rows = await tasksModells.aggregate(pipeline);

    // ---- Shape for UI
    const data = rows.map((t) => ({
      id: t._id,
      title: t.taskname,
      time: formatIST_HHMM(t.createdAt),
      deadline: t.deadline || null,
      current_status: { status: t?.["current_status"]?.status || "—" },
      created_by: {
        _id: t.createdby_id || null,
        user_id: t.createdby_id || null,
        name: t.createdbyname || "—",
        attachment_url: absUrl(req, t.createdby_attachment_url || ""),
      },
      subtask_createdby: t.subtask_createdby || "",
      assigned_to: (t.assigned_to || []).map((a) => ({
        _id: a._id,
        name: a.name,
        attachment_url: absUrl(req, a.attachment_url || ""),
      })),
    }));

    return res.status(200).json({
      filters: {
        from: istStartTodayUTC, // always today
        to: now, // now
        deadlineFrom: null, // ignored
        deadlineTo: null, // ignored
        departments: deptListFromUI,
        createdById: createdByIds,
        assignedToId: assignedToIds,
        window: "TODAY(IST)",
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

    const userRole = String(currentUser?.role || "user").toLowerCase();
    const empId = currentUser?.emp_id;

    const isPrivileged =
      empId === "SE-013" || userRole === "admin" || userRole === "superadmin";

    const pipeline = [];

    // collect subtask creator ids
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

    // regular users only (exclude privileged, managers, visitors)
    if (!isPrivileged && userRole !== "manager" && userRole !== "visitor") {
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

    // look up creator (for department scope + title fallback)
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

    // also need assignees + sub-assignees for dept-based visibility
    pipeline.push(
      // main assignees
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to_users",
        },
      },
      // flatten sub_tasks.assigned_to -> sub_assignee_ids
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
      // sub-assignees users
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

    // ===== Manager / Visitor department scope with Sushant/Sanjiv override =====
    if (userRole === "manager" || userRole === "visitor") {
      const nameLc = String(currentUser?.name || "")
        .trim()
        .toLowerCase();
      const camOverrideNames = new Set([
        "sushant ranjan dubey",
        "sanjiv kumar",
      ]);

      let effectiveDeptList = [];
      if (camOverrideNames.has(nameLc)) {
        // override → CAM + Projects (adjust as needed)
        effectiveDeptList = ["CAM", "Projects"];
      } else if (userRole === "visitor") {
        // visitors see Projects + CAM
        effectiveDeptList = ["Projects", "CAM"];
      } else {
        // manager sees own department
        if (currentUser?.department)
          effectiveDeptList = [currentUser.department];
      }

      if (effectiveDeptList.length > 0) {
        // case-insensitive contains; for strict equality use ^...$ in the regex below
        const deptRegexes = effectiveDeptList.map(
          (d) => new RegExp(`${escRx(d)}`, "i")
          // strict: new RegExp(`^${escRx(d)}$`, "i")
        );

        pipeline.push({
          $match: {
            $or: [
              { "createdBy_info.department": { $in: deptRegexes } },
              { "assigned_to_users.department": { $in: deptRegexes } },
              { "sub_assignees.department": { $in: deptRegexes } },
            ],
          },
        });
      }
    }

    // keep only tasks that actually have comments
    pipeline.push({
      $match: { comments: { $exists: true, $ne: [] } },
    });

    // unwind comments and sort by latest
    pipeline.push(
      { $unwind: "$comments" },
      { $sort: { "comments.updatedAt": -1 } },
      { $limit: 100 }
    );

    // join commenter info
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

    // final projection
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
    return res.status(200).json({ count: data.length, data });
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
      departments = "",
    } = req.query;

    const deptList = String(departments || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const currentUserId = req.user?.userId;
    const currentUser = await User.findById(currentUserId)
      .select("name role emp_id department")
      .lean();
    if (!currentUser)
      return res.status(404).json({ message: "User not found" });

    const userRole = String(currentUser?.role || "user").toLowerCase();
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

    const pushDeptScopeMatch = (pipeline, deptListInput) => {
      if (!deptListInput || deptListInput.length === 0) return;
      const deptRegexes = deptListInput.map(
        (d) => new RegExp(`${escRx(d)}`, "i")
      );
      pipeline.push({
        $match: {
          $or: [
            { "createdBy_info.department": { $in: deptRegexes } },
            { "assigned_to_users.department": { $in: deptRegexes } },
            { "sub_assignees.department": { $in: deptRegexes } },
          ],
        },
      });
    };

    // ===== MODE A: SINGLE USER =====
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

      // ACL: regular users can only see themselves
      if (
        !isPrivileged &&
        userRole !== "manager" &&
        userRole !== "visitor" &&
        String(targetUserId) !== String(currentUserId)
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const pipeline = [];

      if (Object.keys(createdAtMatch).length)
        pipeline.push({ $match: { createdAt: createdAtMatch } });
      if (deadlineMatch) pipeline.push({ $match: { deadline: deadlineMatch } });

      // Normalize top-level assigned_to to array
      pipeline.push({
        $addFields: {
          assigned_to_arr: ARRIFY("$assigned_to"),
        },
      });

      // Reduce sub_tasks and collect normalized assignee ids
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

      // Manager/Visitor dept scope (+ Sushant/Sanjiv override)
      if (userRole === "manager" || userRole === "visitor") {
        const nameLc = String(currentUser?.name || "")
          .trim()
          .toLowerCase();
        const camOverrideNames = new Set([
          "sushant ranjan dubey",
          "sanjiv kumar",
        ]);

        let effectiveDeptList = [];
        if (camOverrideNames.has(nameLc)) {
          effectiveDeptList = ["CAM", "Projects"];
        } else if (userRole === "visitor") {
          effectiveDeptList = ["Projects", "CAM"];
        } else if (currentUser?.department) {
          effectiveDeptList = [currentUser.department];
        }

        pushDeptScopeMatch(pipeline, effectiveDeptList);
      }

      // (We intentionally do NOT apply deptList from UI here in single-user mode)

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
        {
          $addFields: {
            isAssigned: { $or: ["$isAssignedTask", "$isAssignedSubtask"] },
          },
        },
        { $match: { isAssigned: true } }
      );

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

      // exclude cancelled from "assigned"
      pipeline.push({
        $group: {
          _id: null,
          assigned: {
            $sum: {
              $cond: [{ $ne: ["$statusLower", "cancelled"] }, 1, 0],
            },
          },
          completed: { $sum: { $cond: ["$isCompleted", 1, 0] } },
          delayed: { $sum: { $cond: ["$isDelayed", 1, 0] } },

          taskAssigned: {
            $sum: {
              $cond: [
                {
                  $and: [
                    "$isAssignedTask",
                    { $ne: ["$statusLower", "cancelled"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
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

          subAssigned: {
            $sum: {
              $cond: [
                {
                  $and: [
                    "$isAssignedSubtask",
                    { $ne: ["$statusLower", "cancelled"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
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
          department: userDoc?.department || "",
          attachment_url: absUrl(
            req,
            userDoc?.attachment_url || userDoc?.avatar || ""
          ),
          avatar: absUrl(req, userDoc?.attachment_url || userDoc?.avatar || ""),
        },
        filters: {
          from: fFrom || null,
          to: fTo || null,
          deadlineFrom: dFrom || null,
          deadlineTo: dTo || null,
          includeSubtasks: wantsSubtasks,
          departments: deptList, // echo back
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

    // ===== MODE B: LIST / LEADERBOARD =====
    const listPipeline = [];

    if (Object.keys(createdAtMatch).length)
      listPipeline.push({ $match: { createdAt: createdAtMatch } });
    if (deadlineMatch)
      listPipeline.push({ $match: { deadline: deadlineMatch } });

    // Normalize top-level assigned_to
    listPipeline.push({
      $addFields: {
        assigned_to_arr: ARRIFY("$assigned_to"),
      },
    });

    // Collect normalized subtask assignees
    listPipeline.push({
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

    listPipeline.push(
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

    // Manager/Visitor dept scope (+ Sushant/Sanjiv override)
    if (userRole === "manager" || userRole === "visitor") {
      const nameLc = String(currentUser?.name || "")
        .trim()
        .toLowerCase();
      const camOverrideNames = new Set([
        "sushant ranjan dubey",
        "sanjiv kumar",
      ]);

      let effectiveDeptList = [];
      if (camOverrideNames.has(nameLc)) {
        effectiveDeptList = ["CAM", "Projects"];
        // if you store "CAM Team" as exact value, include it too
        // effectiveDeptList = ["CAM", "CAM Team", "Projects"];
      } else if (userRole === "visitor") {
        effectiveDeptList = ["Projects", "CAM"];
      } else if (currentUser?.department) {
        effectiveDeptList = [currentUser.department];
      }

      pushDeptScopeMatch(listPipeline, effectiveDeptList);
    }

    listPipeline.push(
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

    // Build union of assignees using normalized arrays
    listPipeline.push({
      $addFields: {
        union_assignees: wantsSubtasks
          ? {
            $setUnion: [
              { $ifNull: ["$assigned_to_arr", []] },
              { $ifNull: ["$sub_assignee_ids", []] },
            ],
          }
          : { $ifNull: ["$assigned_to_arr", []] },
      },
    });

    listPipeline.push({
      $unwind: { path: "$union_assignees", preserveNullAndEmptyArrays: false },
    });

    listPipeline.push({
      $addFields: {
        assigneeId: "$union_assignees",
        isAssignedTaskUser: {
          $in: ["$union_assignees", { $ifNull: ["$assigned_to_arr", []] }],
        },
        isAssignedSubtaskUser: wantsSubtasks
          ? {
            $in: ["$union_assignees", { $ifNull: ["$sub_assignee_ids", []] }],
          }
          : false,
      },
    });

    // ACL for regular users: see only self (exclude managers, visitors, privileged)
    if (!isPrivileged && userRole !== "manager" && userRole !== "visitor") {
      listPipeline.push({
        $match: { assigneeId: safeObjectId(currentUserId) },
      });
    }

    listPipeline.push(
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

    // Manager/Visitor: extra guard on assignee's department
    if (userRole === "manager" || userRole === "visitor") {
      const nameLc = String(currentUser?.name || "")
        .trim()
        .toLowerCase();
      const camOverrideNames = new Set([
        "sushant ranjan dubey",
        "sanjiv kumar",
      ]);

      let effectiveDeptList = [];
      if (camOverrideNames.has(nameLc)) {
        effectiveDeptList = ["CAM", "Projects"];
        // effectiveDeptList = ["CAM", "CAM Team", "Projects"]; // if needed
      } else if (userRole === "visitor") {
        effectiveDeptList = ["Projects", "CAM"];
      } else if (currentUser?.department) {
        effectiveDeptList = [currentUser.department];
      }

      if (effectiveDeptList.length) {
        const deptRegexes = effectiveDeptList.map(
          (d) => new RegExp(`${escRx(d)}`, "i")
          // strict: new RegExp(`^${escRx(d)}$`, "i")
        );
        listPipeline.push({ $match: { "u.department": { $in: deptRegexes } } });
      }
    }

    // Department filter from UI → apply on user (assignee)
    if (deptList.length) {
      const uiDeptRegexes = deptList.map(
        (d) => new RegExp(`${escRx(d)}`, "i")
        // strict: new RegExp(`^${escRx(d)}$`, "i")
      );
      listPipeline.push({
        $match: { "u.department": { $in: uiDeptRegexes } },
      });
    }

    listPipeline.push({
      $group: {
        _id: "$assigneeId",
        name: { $first: "$u.name" },
        avatar: { $first: "$u.avatar" },
        department: { $first: "$u.department" },
        attachment_url: {
          $first: { $ifNull: ["$u.attachment_url", "$u.avatar"] },
        },
        assigned: {
          $sum: { $cond: [{ $ne: ["$statusLower", "cancelled"] }, 1, 0] },
        },
        completed: { $sum: { $cond: ["$isCompleted", 1, 0] } },
        delayed: { $sum: { $cond: ["$isDelayed", 1, 0] } },

        taskAssigned: {
          $sum: {
            $cond: [
              {
                $and: [
                  "$isAssignedTaskUser",
                  { $ne: ["$statusLower", "cancelled"] },
                ],
              },
              1,
              0,
            ],
          },
        },
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

        subAssigned: {
          $sum: {
            $cond: [
              {
                $and: [
                  "$isAssignedSubtaskUser",
                  { $ne: ["$statusLower", "cancelled"] },
                ],
              },
              1,
              0,
            ],
          },
        },
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

    listPipeline.push({
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

    listPipeline.push({ $sort: { completionPct: -1, assigned: -1, name: 1 } });

    const rows = await tasksModells.aggregate(listPipeline);

    return res.status(200).json({
      mode: "list",
      filters: {
        from: fFrom || null,
        to: fTo || null,
        deadlineFrom: dFrom || null,
        deadlineTo: dTo || null,
        includeSubtasks: wantsSubtasks,
        departments: deptList, // echo back
      },
      count: rows.length,
      users: rows.map((r) => ({
        _id: r._id,
        name: r.name || "",
        attachment_url: absUrl(req, r.attachment_url || ""),
        avatar: absUrl(req, r.attachment_url || ""),
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
    const { from, to, deadlineFrom, deadlineTo, departments = "" } = req.query;

    // parse CSV departments -> array
    const deptList = String(departments || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // --- requester
    const currentUserId = req.user?.userId;
    const currentUser = await User.findById(currentUserId)
      .select("name role emp_id department")
      .lean();
    if (!currentUser)
      return res.status(404).json({ message: "User not found" });

    const userRole = String(currentUser?.role || "user").toLowerCase();
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

    // Collect normalized subtask assignees
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

    // lookups for ACL scoping (manager/visitor dept)
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

    // ACL (regular users only). Managers/visitors are scoped by dept below.
    const me = safeObjectId(currentUserId);
    if (!isPrivileged && userRole !== "manager" && userRole !== "visitor") {
      pipeline.push({
        $match: {
          $or: [
            { createdBy: me },
            { assigned_to_arr: me },
            { sub_assignee_ids: me },
            { followers: me },
          ],
        },
      });
    } else if (userRole === "manager" || userRole === "visitor") {
      // ===== Manager / Visitor department scope with Sushant/Sanjiv override =====
      const nameLc = String(currentUser?.name || "")
        .trim()
        .toLowerCase();
      const camOverrideNames = new Set([
        "sushant ranjan dubey",
        "sanjiv kumar",
      ]);

      let effectiveDeptList = [];
      if (camOverrideNames.has(nameLc)) {
        // override → CAM + Projects (add "CAM Team" if that’s the exact stored value)
        effectiveDeptList = ["CAM", "Projects"];
        // effectiveDeptList = ["CAM", "CAM Team", "Projects"]; // if needed
      } else if (userRole === "visitor") {
        effectiveDeptList = ["Projects", "CAM"];
      } else if (currentUser?.department) {
        effectiveDeptList = [currentUser.department];
      }

      if (effectiveDeptList.length) {
        const deptRegexes = effectiveDeptList.map(
          (d) => new RegExp(`${escRx(d)}`, "i")
          // strict: new RegExp(`^${escRx(d)}$`, "i")
        );
        pipeline.push({
          $match: {
            $or: [
              { "createdBy_info.department": { $in: deptRegexes } },
              { "assigned_to_users.department": { $in: deptRegexes } },
              { "sub_assignees.department": { $in: deptRegexes } },
            ],
          },
        });
      }
    }

    // ---- explicit department filter (CSV) — case-insensitive ----
    if (deptList.length) {
      const uiDeptRegexes = deptList.map(
        (d) => new RegExp(`${escRx(d)}`, "i")
        // strict: new RegExp(`^${escRx(d)}$`, "i")
      );
      pipeline.push({
        $match: {
          $or: [
            { "createdBy_info.department": { $in: uiDeptRegexes } },
            { "assigned_to_users.department": { $in: uiDeptRegexes } },
            { "sub_assignees.department": { $in: uiDeptRegexes } },
          ],
        },
      });
    }
    // -----------------------------------------

    // Only tasks with any project(s)
    pipeline.push({ $match: { project_ids_arr: { $ne: [] } } });

    // Unwind normalized project IDs and join to read state
    pipeline.push(
      { $unwind: "$project_ids_arr" },
      {
        $lookup: {
          from: "projectdetails",
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
        departments: deptList, // echo back
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
      from,
      to,
      deadlineFrom,
      deadlineTo,
      uptoDays = "30",
      departments = "",
    } = req.query;

    // CSV -> array
    const deptList = String(departments || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const currentUserId = req.user?.userId;
    const currentUser = await User.findById(currentUserId)
      .select("name role emp_id department")
      .lean();
    if (!currentUser)
      return res.status(404).json({ message: "User not found" });

    const userRole = String(currentUser?.role || "user").toLowerCase();
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
    const now = new Date();

    // helper to coerce any value to array
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

    /* ---------- pipeline ---------- */
    const pipeline = [];

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

    // subtask creators (support both created_by and createdBy)
    pipeline.push({
      $addFields: {
        subtask_creator_ids: {
          $map: {
            input: { $ifNull: ["$sub_tasks", []] },
            as: "st",
            in: { $ifNull: ["$$st.created_by", "$$st.createdBy"] },
          },
        },
      },
    });

    // flatten sub_tasks.assigned_to -> sub_assignee_ids
    pipeline.push({
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
    });

    // lookups for ACL/dept scoping
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
      },
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

    // ACL for regular users (exclude managers/visitors/privileged)
    if (!isPrivileged && userRole !== "manager" && userRole !== "visitor") {
      const me = safeObjectId(currentUserId);
      pipeline.push({
        $match: {
          $or: [
            { createdBy: me },
            { subtask_creator_ids: me },
            { assigned_to: me },
            { sub_assignee_ids: me },
            { followers: me },
          ],
        },
      });
    }

    // Manager / Visitor department scope with Sushant/Sanjiv override
    if (userRole === "manager" || userRole === "visitor") {
      const nameLc = String(currentUser?.name || "")
        .trim()
        .toLowerCase();
      const camOverride = new Set(["sushant ranjan dubey", "sanjiv kumar"]);

      let effectiveDeptList = [];
      if (camOverride.has(nameLc)) {
        effectiveDeptList = ["CAM", "Projects"];
        // if you store "CAM Team" exactly, include it too:
        // effectiveDeptList = ["CAM", "CAM Team", "Projects"];
      } else if (userRole === "visitor") {
        effectiveDeptList = ["Projects", "CAM"];
      } else if (currentUser?.department) {
        effectiveDeptList = [currentUser.department];
      }

      if (effectiveDeptList.length) {
        const deptRegexes = effectiveDeptList.map(
          (d) => new RegExp(`${escRx(d)}`, "i")
          // strict: new RegExp(`^${escRx(d)}$`, "i")
        );
        pipeline.push({
          $match: {
            $or: [
              { "createdBy_info.department": { $in: deptRegexes } },
              { "assigned_to_users.department": { $in: deptRegexes } },
              { "subtask_creators.department": { $in: deptRegexes } },
              { "sub_assignees.department": { $in: deptRegexes } },
            ],
          },
        });
      }
    }

    // explicit department filter (CSV) — case-insensitive
    if (deptList.length) {
      const uiDeptRegexes = deptList.map(
        (d) => new RegExp(`${escRx(d)}`, "i")
        // strict: new RegExp(`^${escRx(d)}$`, "i")
      );
      pipeline.push({
        $match: {
          $or: [
            { "assigned_to_users.department": { $in: uiDeptRegexes } },
            { "subtask_creators.department": { $in: uiDeptRegexes } },
            { "sub_assignees.department": { $in: uiDeptRegexes } },
            { "createdBy_info.department": { $in: uiDeptRegexes } },
          ],
        },
      });
    }

    // normalize status & compute days …
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
      {
        $addFields: {
          ageDays: { $cond: [{ $lt: ["$ageDaysRaw", 0] }, 0, "$ageDaysRaw"] },
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
      { $match: { ageDays: { $lte: maxDays } } },
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

    const zeros = { completed: 0, pending: 0, cancelled: 0 };
    const thresholds = [0, 1, 2, 3, 7, 14, 30];
    const statsByBucket = {};
    thresholds.forEach((t) => {
      const hit = raw.find((r) => Number(r._id) === Number(t));
      statsByBucket[t] = hit
        ? {
          completed: hit.completed,
          pending: hit.pending,
          cancelled: hit.cancelled,
        }
        : { ...zeros };
    });

    const labels = {
      0: "Same day",
      1: "1 day",
      2: "2 days",
      3: "3 days",
      7: "7 days",
      14: "14 days",
      30: "30 days",
    };
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
        departments: deptList,
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
