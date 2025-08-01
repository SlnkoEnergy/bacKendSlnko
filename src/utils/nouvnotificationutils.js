const { Novu } = require('@novu/node')
const novu = new Novu(process.env.NOVU_SECRET_KEY);

const getNotification = async (workflows, senders, payload) =>{

    const notifiy = senders.map((sender, index) => {
        const workflow = workflows[index];

        return (async() =>{
            await novu.subscribers.identify(workflow, {
                firstName: sender,
            })
            await novu.trigger(workflow, {
                to:{
                    subscriberId: sender,
                },
                payload: payload
            })();
        });
    });

    await Promise.all(notifiy);
};