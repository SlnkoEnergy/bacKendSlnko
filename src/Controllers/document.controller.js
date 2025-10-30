const Documents = require("../models/document.model");

// CREATE a document
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
  if (typeof val === "object") {
    if (val.url) return [val.url];
    return [String(val)];
  }
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

// --- helper: safe ObjectId ---
const toObjectIdOrNull = (v) => {
  try {
    return v && mongoose.Types.ObjectId.isValid(v)
      ? new mongoose.Types.ObjectId(v)
      : null;
  } catch {
    return null;
  }
};

const createDocument = async (req, res) => {
  try {
    const base =
      typeof req.body.data === "string" ? JSON.parse(req.body.data) : req.body;

    const rawProjectId = base.project_id || req.body.project_id;
    const projectOid = toObjectIdOrNull(rawProjectId);
    if (!projectOid) {
      return res
        .status(400)
        .json({ message: "Invalid or missing project_id." });
    }

    const project = await projectModells.findById(projectOid).lean();
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }
    const code = project.code || String(project._id);
    const folderPath = `protrac/Documents/${safe(code)}`;

    const namesFromBracket = normalizeToArray(req.body["names[]"]);
    const namesFromFlat = normalizeToArray(req.body.names);
    const indexedNames = Object.keys(req.body)
      .filter((k) => /^names\[\d+\]$/.test(k))
      .map((k) => req.body[k]);
    const providedNames = [
      ...namesFromBracket,
      ...namesFromFlat,
      ...indexedNames,
    ];

    const saved = [];
    const failed = [];

    if (Array.isArray(req.files) && req.files.length) {
      for (let i = 0; i < req.files.length; i++) {
        const f = req.files[i];
        try {
          const providedName = (providedNames[i] || "").toString().trim();
          const original = f.originalname || "document";
          const dot = original.lastIndexOf(".");
          const originalBase = dot > 0 ? original.slice(0, dot) : original;
          const finalBase = providedName || originalBase;
          const ext = dot > 0 ? original.slice(dot) : "";
          const finalFilename = safe(finalBase) + ext;

          const url = await uploadBufferToBlob({
            buffer: f.buffer,
            originalname: finalFilename,
            mimetype: f.mimetype || "application/octet-stream",
            folderPath,
          });

          // Save a DB row
          const doc = await Documents.create({
            project_id: project._id,
            filename: finalFilename,
            fileurl: url,
            fileType: f.mimetype || "application/octet-stream",
          });

          saved.push(doc);
        } catch (err) {
          failed.push({
            file: f.originalname,
            error: err?.message || "Upload failed",
          });
        }
      }
    }

    const docsFromBase = normalizeToArray(base.documents);
    const docsFromBracket = normalizeToArray(req.body["documents[]"]);
    const docsFromFlat = normalizeToArray(req.body.documents);
    const indexedDocs = Object.keys(req.body)
      .filter((k) => /^documents\[\d+\]$/.test(k))
      .map((k) => req.body[k]);

    const documentUrlCandidates = [
      ...docsFromBase,
      ...docsFromBracket,
      ...docsFromFlat,
      ...indexedDocs,
    ].filter(Boolean);

    for (let i = 0; i < documentUrlCandidates.length; i++) {
      const raw = String(documentUrlCandidates[i] || "").trim();
      if (!raw || !/^https?:\/\//i.test(raw)) continue;

      try {
        const nameIdx = (req.files?.length || 0) + i;
        const providedName = (providedNames[nameIdx] || "").toString().trim();

        const lastSeg = decodeURIComponent(raw.split("/").pop() || "document");
        const dot = lastSeg.lastIndexOf(".");
        const baseName = dot > 0 ? lastSeg.slice(0, dot) : lastSeg;
        const ext = dot > 0 ? lastSeg.slice(dot) : "";
        const finalBase = providedName || baseName;
        const finalFilename = safe(finalBase) + ext;

        const doc = await Documents.create({
          project_id: project._id,
          filename: finalFilename,
          fileurl: raw,
          fileType: "link",
          // uploaded_by: req.user?.userId || null,
          // project_code: code,
        });

        saved.push(doc);
      } catch (err) {
        failed.push({
          url: raw,
          error: err?.message || "Save failed",
        });
      }
    }

    // 5) Response
    return res.status(201).json({
      message:
        failed.length === 0
          ? "All documents saved successfully"
          : saved.length > 0
            ? "Some documents saved; some failed"
            : "No documents saved",
      project: { _id: project._id, code },
      counts: { saved: saved.length, failed: failed.length },
      data: saved,
      failed,
    });
  } catch (error) {
    console.error("uploadAndCreateDocuments error:", error);
    return res
      .status(500)
      .json({ message: error.message || "Internal Server Error" });
  }
};

// READ all documents
const getAllDocuments = async (req, res) => {
  try {
    const docs = await Documents.find().populate("project_id");
    res.status(200).json(docs);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching documents", error: error.message });
  }
};

// READ single document by ID
const getDocumentById = async (req, res) => {
  try {
    const doc = await Documents.findById(req.params.id).populate("project_id");

    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    res.status(200).json(doc);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching document", error: error.message });
  }
};

// UPDATE a document
const updateDocument = async (req, res) => {
  try {
    const updatedDoc = await Documents.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
      }
    );

    if (!updatedDoc) {
      return res.status(404).json({ message: "Document not found" });
    }

    res.status(200).json({
      message: "Document updated successfully",
      data: updatedDoc,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating document", error: error.message });
  }
};

// DELETE a document
const deleteDocument = async (req, res) => {
  try {
    const deletedDoc = await Documents.findByIdAndDelete(req.params.id);

    if (!deletedDoc) {
      return res.status(404).json({ message: "Document not found" });
    }

    res.status(200).json({ message: "Document deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting document", error: error.message });
  }
};

module.exports = {
  createDocument,
  updateDocument,
  getDocumentById,
  getAllDocuments,
  deleteDocument,
};
