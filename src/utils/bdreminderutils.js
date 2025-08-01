const cron = require('node-cron')
const {Novu} = require('@novu/node');
const bdleadsModells = require('../Modells/bdleads/bdleadsModells');
const { getNotification, getnovuNotification } = require('./nouvnotificationutils');


const novu = new Novu(process.env.NOVU_SECRET_KEY);

cron.schedule('0 11 * * *', async() =>{
    try {

        const milestoneDays = [7, 14, 30, 90, 180];
        const cursor = bdleadsModells.aggregate([
            {
                $lookup: {
                    from: "bdtasks",
                    let: {leadId: "$_id"},
                    pipeline : [
                        {$match : {$expr : { $eq : ["$lead_id", "$$leadId"]}}},
                        {
                            $group : {
                                _id : null,
                                lastModifiedTask: {$max: "$updatedAt"},
                            },
                        },
                        {$project : {_id: 0, lastModifiedTask: 1}},
                    ],
                    as: "task_meta",
                },
            },
            {
                $addFields: {
                    lastModifiedTask:{
                        $ifNull: [
                            {$arrayElemAt: ["$task_meta.lastModifiedTask", 0]},
                            "$createdAt",
                        ],
                    },
                    wonStatusDate: {
                        $let: {
                            vars: {
                                wonEntry: {
                                    $first: {
                                        $filter: {
                                            input: "$status_history",
                                            as: "s",
                                            cond: {$eq : ["$$s.name", "won"]},
                                        },
                                    },
                                },
                            },
                            in: "$$wonEntry.updatedAt",
                        },
                    },
                },
            },
            {
                $addFields:{
                    inactiveDays: {
                        $divide: [
                            {$subtract : ["$$NOW", "$lastModifiedTask"]},
                            1000 * 60 * 60 * 24,
                        ],
                    },
                    leadAging: {
                        $ceil: {
                            $divide: [
                                {
                                    $subtract: [
                                        { $ifNull : ["$wonStatusDate", "$$NOW"]},
                                        "$createdAt",
                                    ],
                                },
                                1000 * 60 * 60 * 24,
                            ],
                        },
                    },
                },
            },
            {
                $match: {
                    inactiveDays: { $in : milestoneDays},
                },
            },
        ]).cursor({ batchSize : 100}).exec();

        for(let lead = await cursor.next(); lead != null; lead = await cursor.next()) {

            const workflow = 'reminder'
            const senders = ['assigned to id', 'admin', 'manager'];

            const payload = {
                leadname : lead.name,
                message: `Lead ${lead.name} has been in acitive from ${lead.inactiveDays}`,
            }

            await getnovuNotification(workflow, senders, payload);
        }
        
    } catch (error) {
        console.error( "Cron job error", error);
    }
})