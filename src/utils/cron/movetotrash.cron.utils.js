// const cron = require("node-cron");
// const PayRequest = require("../../Modells/payRequestModells");

// // Run job every minute (for testing)
// // For production, you can use "0 * * * *" to run hourly
// cron.schedule("* * * * *", async () => {
//   const now = new Date();
//   const draftThreshold = new Date(now.getTime() -  60 * 1000); // 2 minutes
//   const trashDeleteThreshold = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); // 15 days

//   try {
//     // console.log("⏳ [Cron] Started @", now.toISOString());

//     // 1️⃣ Draft → Trash Pending
//     const draftQuery = {
//       "approval_status.stage": "Draft",
//       "timers.draft_started_at": { $lte: draftThreshold },
//       "timers.draft_frozen_at": null, // ensure not frozen
//       approved: { $nin: ["Approved", "Rejected"] },
//     };

//     const draftsToUpdate = await PayRequest.find(draftQuery);
//     console.log(`📝 Drafts to move: ${draftsToUpdate.length}`);

//     if (draftsToUpdate.length > 0) {
//       const draftResult = await PayRequest.updateMany(draftQuery, {
//         $set: {
//           "approval_status.stage": "Trash Pending",
//           "timers.trash_started_at": now,
//         },
//         $push: {
//           status_history: {
//             stage: "Trash Pending",
//             remarks: "Auto-moved after 2 minutes in Draft",
//             timestamp: now,
//           },
//         },
//       });
//       // console.log(`📌 Draft → Trash Pending: ${draftResult.modifiedCount} updated`);
//     }

//     // 2️⃣ Delete old Trash Pending (>15 days)
//     const deleteQuery = {
//       "approval_status.stage": "Trash Pending",
//       "timers.trash_started_at": { $lte: trashDeleteThreshold },
//       approved: { $in: ["Pending", "Rejected"] },
//     };

//     const toDelete = await PayRequest.find(deleteQuery);
//     // console.log(`📝 Trash Pending to delete: ${toDelete.length}`);

//     if (toDelete.length > 0) {
//       const deleteResult = await PayRequest.deleteMany(deleteQuery);
//       console.log(`🗑 Deleted: ${deleteResult.deletedCount} old Trash Pending requests`);
//     }

//     // console.log("✅ [Cron] Finished.\n");
//   } catch (err) {
//     console.error("❌ [Cron] Error:", err);
//   }
// });

const cron = require("node-cron");
const PayRequest = require("../../Modells/payRequestModells");

cron.schedule("* * * * *", async () => {
  const now = new Date();
  const draftThreshold = new Date(now.getTime() - 52 * 60 * 60 * 1000);
  const trashDeleteThreshold = new Date(
    now.getTime() - 15 * 24 * 60 * 60 * 1000
  );

  try {
    await PayRequest.updateMany(
      {
        "approval_status.stage": { $in: ["Draft", "SCM", "CAM", "Account"] },
        "timers.draft_started_at": { $lte: draftThreshold },
        "timers.draft_frozen_at": { $exists: false },
        approved: { $nin: ["Approved", "Rejected"] },
      },
      {
        $set: {
          "approval_status.stage": "Trash Pending",
          "timers.trash_started_at": now,
        },
        $push: {
          status_history: {
            stage: "Trash Pending",
            remarks: "Auto-moved after 48 hrs",
            timestamp: now,
          },
        },
      }
    );

    const draftsToUpdate = await PayRequest.find(draftQuery);
    // console.log(`📝 Drafts to move: ${draftsToUpdate.length}`);

    if (draftsToUpdate.length > 0) {
      await PayRequest.updateMany(draftQuery, {
        $set: {
          "approval_status.stage": "Trash Pending",
          "timers.trash_started_at": now,
        },
        $push: {
          status_history: {
            stage: "Trash Pending",
            remarks: "Auto-moved after 2 minutes in Draft",
            timestamp: now,
          },
        },
      });
    }

    const creditQuery = {
      "approval_status.stage": "Credit Pending",
      "credit.credit_deadline": { $lte: now },
    };

    const creditToUpdate = await PayRequest.find(creditQuery);
    // console.log(
    //   `📝 Credit Pending to move back to Draft: ${creditToUpdate.length}`
    // );

    if (creditToUpdate.length > 0) {
      await PayRequest.updateMany(creditQuery, {
        $set: {
          "approval_status.stage": "Draft",
          "timers.draft_started_at": now,
        },
        $push: {
          status_history: {
            stage: "Draft",
            remarks: "Credit deadline expired - moved back to Draft",
            timestamp: now,
          },
        },
      });
    }

    const deleteQuery = {
      "approval_status.stage": "Trash Pending",
      "timers.trash_started_at": { $lte: trashDeleteThreshold },
      approved: { $in: ["Pending", "Rejected"] },
    };

    const toDelete = await PayRequest.find(deleteQuery);
    // console.log(`📝 Trash Pending to delete: ${toDelete.length}`);

    if (toDelete.length > 0) {
      await PayRequest.deleteMany(deleteQuery);
      // console.log(
      //   `🗑 Deleted: ${deleteResult.deletedCount} old Trash Pending requests`
      // );
    }
  } catch (err) {
    console.error(" [Cron] Error:", err);
  }
});
