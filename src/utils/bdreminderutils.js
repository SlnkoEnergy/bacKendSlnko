// const cron = require('node-cron');
// const bdleadsModells = require('../Modells/bdleads/bdleadsModells');
// const { getnovuNotification } = require('./nouvnotificationutils');
// const userModells = require('../Modells/users/userModells');
// const task = require('../Modells/bdleads/task');

// cron.schedule("*/1 * * * *", async () => {
//     console.log(`[${new Date().toISOString()}] Cron job started`);

//     const milestoneDays = [7, 14, 30, 90, 180];

//     const basePipeline = [
//         {
//             $lookup: {
//                 from: "bdtasks",
//                 let: { leadId: "$_id" },
//                 pipeline: [
//                     { $match: { $expr: { $eq: ["$lead_id", "$$leadId"] } } },
//                     {
//                         $group: {
//                             _id: null,
//                             lastModifiedTask: { $max: "$updatedAt" },
//                         },
//                     },
//                     { $project: { _id: 0, lastModifiedTask: 1 } },
//                 ],
//                 as: "task_meta",
//             },
//         },
//         {
//             $addFields: {
//                 lastModifiedTask: {
//                     $ifNull: [
//                         { $arrayElemAt: ["$task_meta.lastModifiedTask", 0] },
//                         "$createdAt",
//                     ],
//                 },
//                 wonStatusDate: {
//                     $let: {
//                         vars: {
//                             wonEntry: {
//                                 $first: {
//                                     $filter: {
//                                         input: "$status_history",
//                                         as: "s",
//                                         cond: { $eq: ["$$s.name", "won"] },
//                                     },
//                                 },
//                             },
//                         },
//                         in: "$$wonEntry.updatedAt",
//                     },
//                 },
//             },
//         },
//         {
//             $addFields: {
//                 inactiveDays: {
//                     $divide: [
//                         { $subtract: ["$$NOW", "$lastModifiedTask"] },
//                         1000 * 60 * 60 * 24,
//                     ],
//                 },
//                 leadAging: {
//                     $divide: [
//                         {
//                             $subtract: [
//                                 { $ifNull: ["$wonStatusDate", "$$NOW"] },
//                                 "$createdAt",
//                             ],
//                         },
//                         1000 * 60 * 60 * 24,
//                     ],
//                 },
//             },
//         },
//         {
//             $project: {
//                 inactiveDays: 1,
//                 leadAging: 1,
//             },
//         },
//     ];

//     console.log(basePipeline);

//     const result = await task.aggregate(basePipeline);

//     console.log(result);

//     // const results = await cursor.toArray();
//     // console.log("Documents found:", results.length);
//     // try {
//     //     let foundAny = false;

//     //     for (let lead = await cursor.next(); lead != null; lead = await cursor.next()) {
//     //         foundAny = true;
//     //         console.log(`Processing lead: ${lead.name} (${lead.inactiveDays} days inactive)`);

//     //         const workflow = 'reminder';
//     //         const sendersList = await userModells.find({
//     //             $or: [
//     //                 { department: 'admin' },
//     //                 { department: 'manager', role: 'BD' }
//     //             ]
//     //         });

//     //         const submittedByUser = await userModells
//     //             .findById(lead.submited_by)
//     //             .select('_id')
//     //             .lean();

//     //         const finalSenders = [...sendersList, submittedByUser];

//     //         const payload = {
//     //             leadname: lead.name,
//     //             message: `Lead ${lead.name} has been inactive for ${lead.inactiveDays} days`
//     //         };

//     //         await getnovuNotification(workflow, finalSenders, payload);
//     //     }

//     //     if (!foundAny) {
//     //         console.log("No leads matched milestone days this run.");
//     //     }
//     // } catch (error) {
//     //     console.error("Cron job error", error);
//     // } finally {
//     //     await cursor.close();
//     // }
// });
