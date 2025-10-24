// src/utils/sendnotification.utils.js
const { Novu } = require('@novu/node');
require('dotenv').config();

let _novu = null;
function getNovu() {
  const key = process.env.NOVU_SECRET_KEY;
  const backendUrl = process.env.NOVU_BACKEND_URL || 'https://notification.slnkoprotrac.com';
  if (!key) throw new Error('NOVU_SECRET_KEY is missing.');
  if (!_novu) {
    _novu = new Novu(key, { backendUrl });
    console.log(`✅ Novu initialized with backend: ${backendUrl}`);
  }
  return _novu;
}

// TODO: replace with your real DB lookup
async function getEmailByUserId(userId) {
  // e.g., const user = await UserModel.findById(userId).select('email');
  // return user?.email || null;
  return null; // placeholder – force you to wire it up
}

async function sendNotification(workflow, userIds, payload = {}) {
  if (!workflow) throw new Error('workflow is required');
  if (!Array.isArray(userIds) || userIds.length === 0)
    throw new Error('at least one subscriber user_id is required');

  const novu = getNovu();

  const results = await Promise.all(
    userIds.map(async (rawId, idx) => {
      const subscriberId = String(rawId).trim();

      // 1) Resolve email (priority: explicit list → payload.email → DB)
      const explicitEmails = Array.isArray(payload.to) ? payload.to : [];
      const inlineEmail = explicitEmails[idx] || payload.email || await getEmailByUserId(subscriberId);

      if (!inlineEmail) {
        console.warn(`⚠️  No email for subscriber ${subscriberId}. Skipping trigger.`);
        return { subscriberId, status: 'skipped-no-email' };
      }

      try {
        // 2) Ensure subscriber has that email saved
        await novu.subscribers.identify(subscriberId, {
          firstName: payload?.firstName || subscriberId,
          email: inlineEmail,
        });

        // 3) Trigger with top-level "to" (NOT inside payload)
        const resp = await novu.trigger(workflow, {
          to: { subscriberId, email: inlineEmail },
          payload: {
            ...payload,
            // OPTIONAL: normalize CC/BCC so your template can use them
            cc: Array.isArray(payload.cc) ? payload.cc : [],
            bcc: Array.isArray(payload.bcc) ? payload.bcc : [],
          },
        });

        console.log(`✅ Triggered ${workflow} for ${subscriberId} -> ${inlineEmail}`);
        console.log('📩 Novu:', JSON.stringify(resp?.data || resp, null, 2));
        return { subscriberId, email: inlineEmail, status: 'processed', tx: resp?.data?.transactionId };
      } catch (err) {
        const status = err?.response?.status;
        const data = err?.response?.data;
        console.error(`❌ Novu failed for ${subscriberId}:`, err?.message, status || '', data || '');
        return { subscriberId, email: inlineEmail, status: 'failed', error: err?.message, statusCode: status, data };
      }
    })
  );

  console.log('📊 Summary:', JSON.stringify(results, null, 2));
  return results;
}

module.exports = { sendNotification, getNovu };
