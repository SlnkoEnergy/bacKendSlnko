const emailtemplateModel = require("../models/emailtemplate.model");

const PLACEHOLDER_RE = /{{\s*([a-zA-Z0-9_.]+)\s*}}|{\s*([a-zA-Z0-9_.]+)\s*}/g;

function extractPlaceholderKeys(str = "") {
  const out = new Set();
  if (typeof str !== "string" || !str) return [];
  let m;
  while ((m = PLACEHOLDER_RE.exec(str))) {
    const key = m[1] || m[2];
    if (key) out.add(key.trim());
  }
  return Array.from(out);
}

function toTitle(s = "") {
  return s
    .split(/[._]/g)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Smart type guessing
function inferType(key = "") {
  const k = key.toLowerCase();
  if (/\b(date|time|timestamp|due)\b/.test(k)) return "date";
  if (
    /\b(amount|total|value|price|rate|qty|quantity|count|no|number)\b/.test(k)
  )
    return "number";
  if (/^(is|has|should)_|_(flag|enabled|disabled)$/.test(k)) return "boolean";
  return "string";
}

// Generic sample generator (no hardcoding)
function sampleFor(type) {
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return true;
    case "date":
      return "YYYY-MM-DD";
    default:
      return "Sample Text";
  }
}

function buildVariables(keys = []) {
  return keys.map((key) => {
    const type = inferType(key);
    const parts = key.split(".");
    const label = toTitle(parts.join(" "));
    return {
      key,
      label,
      type,
      sample: sampleFor(type),
    };
  });
}

function buildVariablesSchema(keys = []) {
  const root = {};
  for (const key of keys) {
    const parts = key.split(".").filter(Boolean);
    if (!parts.length) continue;
    let cur = root;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) cur[p] = inferType(key);
      else {
        cur[p] = cur[p] || {};
        cur = cur[p];
      }
    });
  }
  return root;
}

function toArr(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (v == null) return [];
  return [String(v)];
}

const createEmailTemplate = async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ message: "Template data is required" });
    }

    // Combine all possible text fields where placeholders might exist
    const textToScan = [
      data.subject,
      data.body,
      ...(Array.isArray(data.to) ? data.to : [data.to]),
      ...(Array.isArray(data.cc) ? data.cc : [data.cc]),
      ...(Array.isArray(data.bcc) ? data.bcc : [data.bcc]),
      ...(Array.isArray(data.from) ? data.from : [data.from]),
    ]
      .filter(Boolean)
      .join(" ");

    const keys = extractPlaceholderKeys(textToScan);

    const placeholders = keys;
    const variables = buildVariables(keys);
    const variablesSchema = buildVariablesSchema(keys);

    const newTemplate = new emailtemplateModel({
      ...data,
      placeholders,
      variables,
      variablesSchema,
      createdby: req.user.userId,
    });

    await newTemplate.save();

    res.status(201).json({
      message: "Email Template created successfully",
      template: newTemplate,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { data = {} } = req.body;

    // 1) Load current template so we can merge and scan *full* state
    const current = await emailtemplateModel.findById(id);
    if (!current) {
      return res.status(404).json({ message: "Email Template not found" });
    }

    // 2) Merge current doc with incoming fields (for scanning!)
    //    We merge only fields we care about for placeholder detection.
    const merged = {
      subject: data.subject ?? current.subject,
      body: data.body ?? current.body,
      to: data.to ?? current.to,
      cc: data.cc ?? current.cc,
      bcc: data.bcc ?? current.bcc,
      from: data.from ?? current.from,
    };

    // 3) Build a single string to scan from all possible places
    const textToScan = [
      merged.subject,
      merged.body,
      ...toArr(merged.to),
      ...toArr(merged.cc),
      ...toArr(merged.bcc),
      ...toArr(merged.from),
    ]
      .filter(Boolean)
      .join(" ");

    const keys = extractPlaceholderKeys(textToScan);
    const placeholders = keys;
    const variables = buildVariables(keys);
    const variablesSchema = buildVariablesSchema(keys);

    const $set = {
      ...data,
      placeholders,
      variables,
      variablesSchema,
    };

    // 6) Save and return the fresh version
    const updatedTemplate = await emailtemplateModel.findByIdAndUpdate(
      id,
      { $set },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: "Email Template updated successfully",
      template: updatedTemplate,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateEmailTemplateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    const template = await emailtemplateModel.findById(id);
    if (!template) {
      return res.status(404).json({ message: "Email Template not found" });
    }
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    template.status_history.push({ status, user_id: req.user.userId, remarks });
    await template.save();
    res.status(200).json({
      message: "Email Template status updated successfully",
      data:template,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const deleteEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedTemplate = await emailtemplateModel.findByIdAndDelete(id);
    if (!deletedTemplate) {
      return res.status(404).json({ message: "Email Template not found" });
    }
    res.status(200).json({
      message: "Email Template deleted successfully",
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getEmailTemplates = async (req, res) => {
  try {
    const { page, limit, search } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { identifier: { $regex: search, $options: "i" } },
      ];
    }
    const templates = await emailtemplateModel
      .find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await emailtemplateModel.countDocuments(query);
    res.status(200).json({
      message: "Email Templates fetched successfully",
      data: templates,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getEmailTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await emailtemplateModel.findById(id);
    if (!template) {
      return res.status(404).json({ message: "Email Template not found" });
    }
    res.status(200).json({
      message: "Email Template fetched successfully",
      data: template,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getTemplateUniqueTags = async (req, res) => {
  try {
    const raw = await emailtemplateModel.distinct("tags", {
      tags: { $exists: true, $ne: [] },
    });

    res.status(200).json({
      message: "Unique tags fetched successfully",
      data: raw.filter(Boolean), 
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  createEmailTemplate,
  updateEmailTemplate,
  updateEmailTemplateStatus,
  deleteEmailTemplate,
  getEmailTemplates,
  getEmailTemplateById,
  getTemplateUniqueTags
};
