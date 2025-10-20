// src/utils/novuNotification.utils.js   ← ensure this exact file name & casing
const { Novu } = require('@novu/node');

function getNovuNotification(workflow, senders = [], payload = {}) {
  const novu = new Novu(process.env.NOVU_SECRET_KEY, {
    backendUrl: process.env.NOVU_API_URL,
  });

  const jobs = (senders || []).map((raw) => (async () => {
    const subscriberId = String(raw || '').trim();
    if (!subscriberId) return;
    await novu.subscribers.identify(subscriberId, { firstName: subscriberId });
    await novu.trigger(workflow, { to: { subscriberId }, payload });
  })());

  return Promise.allSettled(jobs);
}

module.exports = { getNovuNotification }; 
