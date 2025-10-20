const { Novu } = require('@novu/node');

const novu = new Novu(process.env.NOVU_SECRET_KEY, {
  backendUrl: process.env.NOVU_API_URL,
});

const getnovuNotification = async (workflow, senders = [], payload = {}) => {
  if (!workflow) throw new Error('Missing workflow identifier');
  if (!Array.isArray(senders) || senders.length === 0) return;

  const jobs = senders.map((senderRaw) => (async () => {
    const subscriberId = String(senderRaw || '').trim();
    if (!subscriberId) return;

    try {
      // Create/ensure the subscriber exists
      await novu.subscribers.identify(subscriberId, {
        firstName: subscriberId, // or a real name if you have it
      });

      // Trigger your workflow
      await novu.trigger(workflow, {
        to: { subscriberId },
        payload,
      });
    } catch (err) {
      console.error(`❌ Failed for ${subscriberId}:`, err?.message || err);
    }
  })());

  await Promise.allSettled(jobs);
};

module.exports = { getnovuNotification };
