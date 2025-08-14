const cron = require("node-cron");
const PayRequest = require("../../Modells/payRequestModells");

cron.schedule("0 * * * *", async () => {
  const now = new Date();

  const draftThreshold = new Date(now.getTime() - 52 * 60 * 60 * 1000);
  const trashThreshold = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

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

    if (draftResult.modifiedCount > 0) {
      console.log(`Moved ${draftResult.modifiedCount} drafts to Trash Pending`);
    }

    const deleteResult = await PayRequest.deleteMany({
      "approval_status.stage": "Trash Pending",
      "timers.trash_started_at": { $lte: trashThreshold },
      approved: { $in: ["Pending", "Rejected"] },
    });

    if (deleteResult.deletedCount > 0) {
      console.log(
        `Deleted ${deleteResult.deletedCount} entries from trash after 15 days`
      );
    }

    const creditResult = await PayRequest.updateMany(
      {
        "approval_status.stage": "Credit Pending",
        "credit.credit_deadline": { $lte: now },
      },
      [
        {
          $set: {
            "approval_status.stage": "Draft",
            "timers.draft_started_at": now,
          },
        },
        {
          $push: {
            status_history: {
              stage: "Draft",
              remarks: "Credit deadline expired - moved to Draft",
              timestamp: now,
            },
          },
        },
      ]
    );

    if (creditResult.modifiedCount > 0) {
      console.log(
        `Moved ${creditResult.modifiedCount} Credit Pending to Draft`
      );
    }
  } catch (err) {
    console.error("Error in cron job:", err);
  }
});
