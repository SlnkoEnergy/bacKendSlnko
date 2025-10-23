// utils/emailCompiler.js
const EmailTemplate = require("../models/emailtemplate.model");
const EmailMessage = require("../models/emails.model");
const { default: mongoose } = require("mongoose");

function getValueByPath(payload, path) {
  if (!path) return undefined;
  if (!payload || typeof payload !== "object") return undefined;

  if (Object.prototype.hasOwnProperty.call(payload, path)) {
    return payload[path];
  }

  const parts = String(path).split(".");
  let cur = payload;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) {
      cur = cur[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function extractPlaceholders(str = "") {
  if (typeof str !== "string") return [];
  const mustache = [...str.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map(
    (m) => m[1]
  );
  const singleBraces = [...str.matchAll(/\{([a-zA-Z0-9_.]+)\}/g)].map(
    (m) => m[1]
  );
  return Array.from(new Set([...mustache, ...singleBraces]));
}

function renderString(str, payload, { strict = false } = {}) {
  if (typeof str !== "string") return str;

  str = str.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, p1) => {
    const val = getValueByPath(payload, p1);
    if (val === undefined || val === null) {
      if (strict) throw new Error(`Missing payload value for {{${p1}}}`);
      return "";
    }
    return String(val);
  });

  str = str.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, p1) => {
    const val = getValueByPath(payload, p1);
    if (val === undefined || val === null) {
      if (strict) throw new Error(`Missing payload value for {${p1}}`);
      return "";
    }
    return String(val);
  });

  return str;
}

function renderStringArray(arr, payload, opts) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => renderString(s, payload, opts)).filter(Boolean);
}

function collectAllPlaceholders(template) {
  const fields = [
    template.subject,
    template.body,
    ...(template.to || []),
    ...(template.cc || []),
    ...(template.bcc || []),
    ...(template.from || []),
    ...(template.replyTo || []),
  ];

  // attachments fields
  if (Array.isArray(template.attachments)) {
    template.attachments.forEach((a) => {
      if (a?.filename) fields.push(a.filename);
      if (a?.fileUrl) fields.push(a.fileUrl);
      if (a?.fileType) fields.push(a.fileType);
    });
  }

  const inFields = fields.flatMap(extractPlaceholders);
  const declared = Array.isArray(template.placeholders)
    ? template.placeholders
    : [];
  return Array.from(new Set([...inFields, ...declared]));
}

function assertRequiredPlaceholders(placeholders, payload) {
  const missing = [];
  for (const key of placeholders) {
    const val = getValueByPath(payload, key);
    if (val === undefined || val === null || val === "") {
      missing.push(key);
    }
  }
  if (missing.length) {
    const err = new Error(
      `Missing required payload keys: ${missing.join(", ")}`
    );
    err.missing = missing;
    throw err;
  }
}

function compileEmail(templateDoc, payload, { strict = false } = {}) {
  if (!templateDoc) throw new Error("Template is required");
  if (templateDoc?.current_status?.status === "inactive") {
    throw new Error(`Template "${templateDoc.identifier}" is inactive`);
  }

  const required = collectAllPlaceholders(templateDoc);
  if (strict) {
    assertRequiredPlaceholders(required, payload);
  }

  const subject = renderString(templateDoc.subject, payload, { strict });
  const body = renderString(templateDoc.body, payload, { strict });

  const to = renderStringArray(
    [templateDoc.to].flat().filter(Boolean),
    payload,
    { strict }
  );
  const cc = renderStringArray(templateDoc.cc || [], payload, { strict });
  const bcc = renderStringArray(templateDoc.bcc || [], payload, { strict });
  const from = renderStringArray(templateDoc.from || [], payload, { strict });
  const replyTo = renderStringArray(templateDoc.replyTo || [], payload, {
    strict,
  });

  const attachments = (templateDoc.attachments || []).map((a) => ({
    filename: renderString(a.filename || "", payload, { strict }),
    fileUrl: renderString(a.fileUrl || "", payload, { strict }),
    fileType: renderString(a.fileType || "", payload, { strict }),
  }));
  return {
    template_id: templateDoc._id,
    identifier: templateDoc.identifier,
    to: to,
    cc,
    bcc,
    name_to_send: payload?.name_to_send || [],
    from: Array.isArray(from) && from.length > 0 ? from[0] : undefined,
    replyTo,
    subject,
    body,
    bodyFormat: templateDoc.bodyFormat || "html",
    attachments,
    payload,
    createdby:
      payload?.user_id && mongoose.Types.ObjectId.isValid(payload.user_id)
        ? new mongoose.Types.ObjectId(payload.user_id)
        : undefined,
  };
}

async function createEmailLog(
  doc,
  { status = "queued", provider_response = null, error = null } = {}
) {
  const log = new EmailMessage({
    compiled: doc,
    status,
    email_template_id: doc._id || null,
    provider_response,
    error,
    sent_at: status === "sent" ? new Date() : null,
    createdby: doc.createdby || null,
  });
  return log.save();
}

async function sendUsingTemplate(
  identifier,
  payload,
  emailService,
  { strict = false } = {}
) {
  const template = await EmailTemplate.findOne({ identifier });
  if (!template) {
    throw new Error(`Email template not found for identifier: ${identifier}`);
  }

  const compiled = compileEmail(template, payload, { strict });

  const queuedLog = await createEmailLog(compiled, { status: "queued" });

  //   try {
  //     const providerResp = await emailService.send({
  //       to: compiled.to,
  //       cc: compiled.cc,
  //       bcc: compiled.bcc,
  //       from: compiled.from?.[0],
  //       replyTo: compiled.replyTo?.[0],
  //       subject: compiled.subject,
  //       html: compiled.bodyFormat === "html" ? compiled.body : undefined,
  //       text: compiled.bodyFormat === "text" ? compiled.body : undefined,
  //       attachments: compiled.attachments?.map((a) => ({
  //         filename: a.filename,
  //         href: a.fileUrl,
  //         contentType: a.fileType,
  //       })),
  //     });
  //     queuedLog.status = "sent";
  //     queuedLog.provider_response = providerResp;
  //     queuedLog.sent_at = new Date();
  //     await queuedLog.save();
  //     return { ok: true, logId: queuedLog._id, providerResp };
  //   } catch (err) {
  //     queuedLog.status = "failed";
  //     queuedLog.error = err?.message || String(err);
  //     await queuedLog.save();
  //     throw err;
  //   }
}

module.exports = {
  getValueByPath,
  extractPlaceholders,
  renderString,
  compileEmail,
  sendUsingTemplate,
};
