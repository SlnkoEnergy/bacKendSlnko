// src/utils/sendnotification.utils.js
const { Novu } = require("@novu/api");
require("dotenv").config();

let _novu = null;

/** Initialize and cache Novu instance */
function getNovu() {
  const secretKey = process.env.NOVU_SECRET_KEY;
  if (!secretKey) throw new Error("NOVU_SECRET_KEY is missing.");

  // Self-hosted Novu API must include /api
  const serverURL =
    process.env.NOVU_BACKEND_URL || "https://notification.slnkoprotrac.com/api";

  if (!_novu) {
    _novu = new Novu({ secretKey, serverURL });
    console.log(`✅ Novu initialized with backend: ${serverURL}`);
  }
  return _novu;
}

async function sendNotification({
  workflowId,
  subscriberId,
  subject,
  body,
  to = [], // array of strings; ALL will be sent as To
  cc = [], // optional; merged into To
  bcc = [], // optional; merged into To
  from = "it@slnkoenergy.com",
  replyTo,
  integrationIdentifier = "plunk",
}) {
  if (!workflowId) throw new Error("workflowId is required");
  if (!subscriberId) throw new Error("subscriberId is required");
  if (!subject) throw new Error("subject is required");
  if (!body) throw new Error("body is required");

  const novu = getNovu();

  const payload = { subject, body };

  const normList = (arr) => [
    ...new Set((arr || []).map((s) => String(s).trim()).filter(Boolean)),
  ];

  const toAll = normList([...to, ...cc, ...bcc]);
  if (toAll.length === 0) {
    throw new Error(
      "At least one recipient is required (to/cc/bcc are all empty)."
    );
  }

  const primaryTo = toAll[0];

  const overrides = {
    email: {
      from,
      ...(replyTo ? { replyTo } : {}),
      to: toAll,
      ...(integrationIdentifier ? { integrationIdentifier } : {}),
    },
  };

  const res = await novu.trigger({
    workflowId,
    to: { subscriberId, email: primaryTo },
    payload,
    overrides,
  });

  return res?.data || res;
}

module.exports = { sendNotification };
