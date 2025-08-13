const cron = require("node-cron");
const PayRequest = require("../../Modells/payRequestModells");

cron.schedule("0 * * * *", async () => {
  const now = new Date();
  const draftThreshold = new Date(now.getTime() - 52 * 60 * 60 * 1000); 
  const trashThreshold = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

  try {
  
    const draftOrCreditResult = await PayRequest.updateMany(
      {
        $or: [
          {
          
            "approval_status.stage": { $in: ["Draft", "SCM", "CAM", "Account"] },
            "timers.draft_started_at": { $lte: draftThreshold },
            "timers.draft_frozen_at": { $exists: false },
            approved: { $nin: ["Approved", "Rejected"] },
          },
          {
          
            "approval_status.stage": "Credit Pending",
            "credit.credit_deadline": { $lte: now },
          },
        ],
      },
      [
        {
          $set: {
            "approval_status.stage": {
              $cond: [
                { $in: ["$approval_status.stage", ["Draft", "SCM", "CAM", "Account"]] },
                "Trash Pending",
                "Draft",
              ],
            },
            "timers.trash_started_at": {
              $cond: [
                { $in: ["$approval_status.stage", ["Draft", "SCM", "CAM", "Account"]] },
                now,
                "$timers.trash_started_at",
              ],
            },
            "timers.draft_started_at": {
              $cond: [
                { $eq: ["$approval_status.stage", "Credit Pending"] },
                now,
                "$timers.draft_started_at",
              ],
            },
          },
        },
        {
          $push: {
            status_history: {
              $cond: [
                { $in: ["$approval_status.stage", ["Draft", "SCM", "CAM", "Account"]] },
                { stage: "Trash Pending", remarks: "Auto-moved after 48 hrs", timestamp: now },
                { stage: "Draft", remarks: "Credit deadline expired - moved to Draft", timestamp: now },
              ],
            },
          },
        },
      ]
    );

    if (draftOrCreditResult.modifiedCount > 0) {
      // console.log(
      //   `Updated ${draftOrCreditResult.modifiedCount} Draft or Credit Pending entries`
      // );
    }

    const deleteResult = await PayRequest.deleteMany({
      "approval_status.stage": "Trash Pending",
      "timers.trash_started_at": { $lte: trashThreshold },
      approved: { $in: ["Pending", "Rejected"] },
    });

    if (deleteResult.deletedCount > 0) {
      // console.log(
      //   `Deleted ${deleteResult.deletedCount} entries from trash after 15 days`
      // );
    }
  } catch (err) {
    console.error("Error in cron job:", err);
  }
});
