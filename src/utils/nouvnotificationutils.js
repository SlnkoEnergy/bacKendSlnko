const { Novu } = require('@novu/node');

const getnovuNotification = async (workflow, senders, payload) => {
  const novu = new Novu(process.env.NOVU_SECRET_KEY);

  const notify = senders.map((sender, index) => {
    

    return (async () => {
      if (!sender || !workflow) {
        console.warn("Skipping due to missing sender or workflow.");
        return;
      }

      try {
        await novu.subscribers.identify(sender, {
          firstName: sender,
        });

        await novu.trigger(workflow, {
          to: {
            subscriberId: sender,
          },
          payload: payload,
        });

      } catch (err) {
        console.error(`❌ Failed for ${sender}:`, err.message);
      }
    })(); 
  });

  await Promise.all(notify);
};

module.exports = {
  getnovuNotification,
};
