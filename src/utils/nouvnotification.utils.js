// src/utils/novuNotification.utils.js
const { Novu } = require('@novu/node');

function getNovu() {
  const secret = process.env.NOVU_SECRET_KEY;
  if (!secret) {
    throw new Error(
      'NOVU_SECRET_KEY is missing. Load dotenv early or set the env var.'
    );
  }

  const backendUrl = process.env.NOVU_API_URL;
  return new Novu(secret, { backendUrl });
}

const getNovuNotification = async (workflow, senders = [], payload = {}) => {
  if (!workflow || !Array.isArray(senders) || senders.length === 0) return;

  const novu = getNovu();

  const jobs = senders.map((raw) => (async () => {
    const subscriberId = String(raw || '').trim();
    if (!subscriberId) return;

    try {
      await novu.subscribers.identify(subscriberId, { firstName: subscriberId });
      await novu.trigger(workflow, { to: { subscriberId }, payload });
    } catch (err) {
      console.error(`❌ Novu failed for ${subscriberId}:`, err?.message || err);
    }
  })());

  await Promise.allSettled(jobs);
};

module.exports = { getNovuNotification };
