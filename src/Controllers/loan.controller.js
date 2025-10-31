const Loan = require("../models/loan.model");
const projectModel = require("../models/project.model");
const Documents = require("../models/document.model");
const axios = require("axios");
const FormData = require("form-data");

const safe = (str = "") =>
  String(str)
    .trim()
    .replace(/[\/\\\s]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_");

function normalizeToArray(val) {
  if (val == null) return [];
  if (typeof val === "string") {
    const t = val.trim();
    if (t.startsWith("[") && t.endsWith("]")) {
      try {
        const arr = JSON.parse(t);
        return Array.isArray(arr) ? arr : [t];
      } catch {
        return [val];
      }
    }
    return [val];
  }
  if (Array.isArray(val)) return val;
  if (typeof val === "object") return [val];
  return [String(val)];
}

async function uploadBufferToBlob({
  buffer,
  originalname,
  mimetype,
  folderPath,
}) {
  const form = new FormData();
  form.append("file", buffer, {
    filename: originalname,
    contentType: mimetype,
  });

  const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${encodeURIComponent(folderPath)}`;

  const resp = await axios.post(uploadUrl, form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const d = resp.data;
  const url =
    Array.isArray(d) && d.length > 0
      ? d[0]
      : d.url || d.fileUrl || (d.data && d.data.url) || null;

  if (!url) throw new Error("UPLOAD_API did not return a file URL");
  return url;
}

function parseFileFilenameMap(body) {
  const items = [];

  const fromFlat = normalizeToArray(body.file_filename);
  const fromBracket = normalizeToArray(body["file_filename[]"]);
  const raw = [...fromFlat, ...fromBracket];

  raw.forEach((item) => {
    try {
      if (typeof item === "string") {
        const maybe = JSON.parse(item);
        items.push(maybe);
      } else if (typeof item === "object" && item) {
        items.push(item);
      }
    } catch {
      items.push({ name: String(item) });
    }
  });

  const indexKeys = Object.keys(body)
    .map((k) => {
      const m = k.match(/^file_filename\[(\d+)\]\[(name|fileIndex|url)\]$/);
      if (!m) return null;
      return { idx: Number(m[1]), key: m[2], value: body[k] };
    })
    .filter(Boolean);

  if (indexKeys.length) {
    const grouped = new Map();
    for (const { idx, key, value } of indexKeys) {
      if (!grouped.has(idx)) grouped.set(idx, {});
      grouped.get(idx)[key] = value;
    }
    for (const [, obj] of grouped) items.push(obj);
  }

  return items
    .map((o) => {
      const out = { name: (o.name || "").toString().trim() };
      if (o.url) out.url = (o.url || "").toString().trim();
      if (
        o.fileIndex !== undefined &&
        o.fileIndex !== null &&
        o.fileIndex !== ""
      ) {
        const n = Number(o.fileIndex);
        if (!Number.isNaN(n) && n >= 0) out.fileIndex = n;
      }
      return out;
    })
    .filter((o) => o.name || o.url || o.fileIndex !== undefined);
}

const createLoan = async (req, res) => {
  try {
    const base =
      typeof req.body.data === "string" ? JSON.parse(req.body.data) : req.body;

    const { project_id } = req.query;
    if (!project_id)
      return res
        .status(400)
        .json({ message: "project_id query param is required." });

    const project = await projectModel.findById(project_id).lean();
    if (!project)
      return res.status(404).json({ message: "Project not found." });

    const code = safe(project.code || project._id.toString());
    const folderPath = `protrac/loan/${code}`;

    const files = Array.isArray(req.files) ? req.files : [];
    const fileMap = parseFileFilenameMap(req.body);

    const savedDocs = [];
    const failed = [];

    for (let i = 0; i < fileMap.length; i++) {
      const item = fileMap[i];
      const rawName = (item.name || "").toString().trim();
      const safeName = safe(rawName || "document");

      try {
        if (item.fileIndex !== undefined) {
          const f = files[item.fileIndex];
          if (!f) {
            failed.push({
              name: rawName,
              error: `No uploaded file at fileIndex=${item.fileIndex}`,
            });
            continue;
          }

          const original = f.originalname || "document";
          const dot = original.lastIndexOf(".");
          const ext = dot > 0 ? original.slice(dot) : "";
          const finalFilename = safeName + ext;

          const url = await uploadBufferToBlob({
            buffer: f.buffer,
            originalname: finalFilename,
            mimetype: f.mimetype || "application/octet-stream",
            folderPath,
          });

          const doc = {
            filename: finalFilename,
            fileurl: url,
            fileType: f.mimetype || "application/octet-stream",
            createdBy: req.user.userId,
          };
          savedDocs.push(doc);

          await Documents.create({
            project_id: project._id,
            ...doc,
          });
        } else if (item.url) {
          const lastSeg = decodeURIComponent(item.url.split("/").pop() || "");
          const dot = lastSeg.lastIndexOf(".");
          const guessedExt = dot > 0 ? lastSeg.slice(dot) : "";
          const finalFilename = guessedExt
            ? safe(safeName) + guessedExt
            : safeName;

          const doc = {
            filename: finalFilename,
            fileurl: item.url,
            fileType: "link",
            createdBy: req.user.userId,
          };
          savedDocs.push(doc);

          await Documents.create({
            project_id: project._id,
            ...doc,
          });
        }
      } catch (err) {
        failed.push({
          name: rawName || "(unnamed)",
          error: err?.message || "Processing failed",
        });
      }
    }

    const incomingDocs = Array.isArray(base.documents) ? base.documents : [];
    const haveByName = new Set(
      savedDocs.map((d) => (d.filename || "").trim().toLowerCase())
    );

    for (const d of incomingDocs) {
      const title = (d?.title || "").toString().trim();
      if (!title) continue;
      const key = title.toLowerCase();

      if (haveByName.has(key)) continue;

      if (d.present === true) {
        savedDocs.push({
          filename: title,
          fileurl: "",
          fileType: "existing",
          createdBy: req.user.userId,
        });
        haveByName.add(key);
      } else {
        savedDocs.push({
          filename: title,
          createdBy: req.user.userId,
        });
        haveByName.add(key);
      }
    }

    const loanPayload = {
      project_id: project._id,
      documents: savedDocs,
      banking_details: Array.isArray(base.banking_details)
        ? base.banking_details
        : [],
      timelines: {
        expected_disbursement_date: base.expectedDisbursementDate
          ? new Date(base.expectedDisbursementDate)
          : null,
        expected_sanctioned_date: base.expectedSanctionDate
          ? new Date(base.expectedSanctionDate)
          : null,
      },
    };

    const loan = new Loan(loanPayload);
    await loan.save();

    return res.status(201).json({
      success: true,
      message:
        failed.length === 0
          ? "Loan created successfully"
          : savedDocs.length > 0
            ? "Loan created with some failed documents"
            : "No documents saved",
      project: { _id: project._id, code },
      counts: { saved: savedDocs.length, failed: failed.length },
      data: loan,
      failed,
    });
  } catch (error) {
    console.error("createLoan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

const getAllLoans = async (req, res) => {
  try {
    const { page, limit, search } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { "banking_details.name": { $regex: search, $options: "i" } },
        { "documents.name": { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = Math.max(parseInt(page), 1);
    const pageSize = Math.max(parseInt(limit), 10);
    const skip = (pageNum - 1) * pageSize;

    const [loans, total] = await Promise.all([
      Loan.find(query)
        .populate(
          "project_id",
          "_id code customer number project_category state project_kwp dc_capacity"
        )
        .populate("current_status.user_id", "_id name email")
        .skip(skip)
        .limit(pageSize)
        .sort({ createdAt: -1 })
        .lean(),
      Loan.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      meta: {
        total,
        page: pageNum,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
      data: loans,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getLoanById = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
      .populate("project_id")
      .populate("status_history.user_id")
      .populate("current_status.user_id");

    if (!loan)
      return res
        .status(404)
        .json({ success: false, message: "Loan not found" });

    res.status(200).json({ success: true, data: loan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateLoan = async (req, res) => {
  try {
    const base =
      typeof req.body.data === "string" ? JSON.parse(req.body.data) : req.body;

    const { id } = req.params;

    const loan = await Loan.findById(id);
    if (!loan) {
      return res
        .status(404)
        .json({ success: false, message: "Loan not found" });
    }

    const rawProjectId = req.query.project_id || loan.project_id;
    if (!rawProjectId) {
      return res.status(400).json({
        success: false,
        message: "project_id is required (query or in loan)",
      });
    }

    const project = await projectModel.findById(rawProjectId).lean();
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found." });
    }

    const code = safe(project.code || project._id.toString());
    const folderPath = `protrac/loan/${code}`;

    const files = Array.isArray(req.files) ? req.files : [];
    const mapItems = parseFileFilenameMap(base);

    const upserts = [];
    const failed = [];

    for (const item of mapItems) {
      const rawName = item.name ? item.name.toString().trim() : "";
      const safeName = safe(rawName || "document");

      try {
        if (item.fileIndex !== undefined) {
          const f = files[item.fileIndex];
          if (!f) {
            failed.push({
              name: rawName,
              error: `No uploaded file at fileIndex=${item.fileIndex}`,
            });
            continue;
          }

          const original = f.originalname || "document";
          const dot = original.lastIndexOf(".");
          const ext = dot > 0 ? original.slice(dot) : "";
          const finalFilename = safeName + ext;

          const url = await uploadBufferToBlob({
            buffer: f.buffer,
            originalname: finalFilename,
            mimetype: f.mimetype || "application/octet-stream",
            folderPath,
          });

          upserts.push({
            filename: finalFilename,
            fileurl: url,
            fileType: f.mimetype || "application/octet-stream",
          });
          continue;
        }

        if (item.url) {
          const lastSeg = decodeURIComponent(item.url.split("/").pop() || "");
          const dot = lastSeg.lastIndexOf(".");
          const ext = dot > 0 ? lastSeg.slice(dot) : "";
          const finalFilename = ext ? safeName + ext : safeName;

          upserts.push({
            filename: finalFilename,
            fileurl: item.url,
            fileType: "link",
          });
          continue;
        }

        upserts.push({
          filename: safeName,
          fileurl: "",
          fileType: "manual",
        });
      } catch (err) {
        failed.push({
          name: rawName || "(unnamed)",
          error: err?.message || "Processing failed",
        });
      }
    }

    if (!Array.isArray(loan.documents)) loan.documents = [];

    for (const doc of upserts) {
      const idx = loan.documents.findIndex((d) => d.filename === doc.filename);
      if (idx !== -1) {
        if (typeof doc.fileurl === "string")
          loan.documents[idx].fileurl = doc.fileurl;
        if (typeof doc.fileType === "string")
          loan.documents[idx].fileType = doc.fileType;
      } else {
        loan.documents.push(doc);
      }
    }

    if (base.banking_details !== undefined)
      loan.banking_details = base.banking_details;
    if (base.status_history !== undefined)
      loan.status_history = base.status_history;
    if (base.current_status !== undefined)
      loan.current_status = base.current_status;
    if (base.timelines !== undefined) loan.timelines = base.timelines;

    const updated = await loan.save();

    return res.status(200).json({
      success: true,
      message:
        failed.length === 0
          ? "Loan updated successfully"
          : "Loan updated with some upload errors",
      data: updated,
      failed,
    });
  } catch (error) {
    console.error("updateLoan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

const updateLoanStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;
    if (!status || !remarks) {
      return res.status(404).json({
        message: "Status and Remarks are required",
      });
    }
    const loan = await Loan.findById(id);
    if (!loan) {
      return res
        .status(404)
        .json({ success: false, message: "Loan not found" });
    }
    loan.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
    });
    await loan.save();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteLoan = async (req, res) => {
  try {
    const loan = await Loan.findByIdAndDelete(req.params.id);

    if (!loan)
      return res
        .status(404)
        .json({ success: false, message: "Loan not found" });

    res
      .status(200)
      .json({ success: true, message: "Loan deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
const getUniqueBank = async (req, res) => {
  try {
    const { search } = req.query;
    const searchRegex = search
      ? new RegExp(search.trim().replace(/\s+/g, ".*"), "i")
      : null;

    const matchStage = {
      "banking_details.name": { $exists: true, $ne: null },
      "banking_details.branch": { $exists: true, $ne: null },
      "banking_details.ifsc_code": { $exists: true, $ne: null },
    };

    const banks = await Loan.aggregate([
      { $unwind: "$banking_details" },
      { $match: matchStage },
      {
        $project: {
          name: { $toLower: { $trim: { input: "$banking_details.name" } } },
          branch: { $toLower: { $trim: { input: "$banking_details.branch" } } },
          ifsc_code: {
            $toLower: { $trim: { input: "$banking_details.ifsc_code" } },
          },
        },
      },
      // --- Apply search filter if provided ---
      ...(searchRegex
        ? [
            {
              $match: {
                name: { $regex: searchRegex },
              },
            },
          ]
        : []),
      {
        $group: {
          _id: {
            name: "$name",
            branch: "$branch",
            ifsc_code: "$ifsc_code",
          },
        },
      },
      {
        $project: {
          _id: 0,
          name: "$_id.name",
          branch: "$_id.branch",
          ifsc_code: "$_id.ifsc_code",
        },
      },
      { $sort: { name: 1, branch: 1 } },
    ]);

    const cleaned = banks.filter(
      (b) =>
        b.name &&
        !["na", "n/a", "none", ""].includes(b.name) &&
        b.branch &&
        b.ifsc_code
    );

    res.status(200).json({
      success: true,
      message: "Unique banks retrieved successfully",
      count: cleaned.length,
      data: cleaned,
    });
  } catch (error) {
    console.error("getUniqueBank error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  createLoan,
  getAllLoans,
  getLoanById,
  updateLoan,
  updateLoanStatus,
  deleteLoan,
  getUniqueBank,
};
