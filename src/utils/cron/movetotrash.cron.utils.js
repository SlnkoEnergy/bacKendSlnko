const cron = require("node-cron");
const PayRequest = require("../../models/payRequestModells");

cron.schedule("* * * * *", async () => {
  const now = new Date();
  const THRESHOLD_48H = new Date(now.getTime() - 52 * 60 * 60 * 1000);
  const TRASH_DELETE_THRESHOLD = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

  try {
    const moveToTrashQuery = {
      approved: { $nin: ["Approved", "Rejected"] },
      $or: [
        {
          "approval_status.stage": "Draft",
          "timers.draft_started_at": { $lte: THRESHOLD_48H },
          $or: [
            { "timers.draft_frozen_at": null },
            { "timers.draft_frozen_at": { $exists: false } },
          ],
        },
        {
          "approval_status.stage": "CAM",
          $or: [
            { "timers.cam_started_at": { $lte: THRESHOLD_48H } },
            {
              $and: [
                { "timers.cam_started_at": { $exists: false } },
                { "timers.draft_started_at": { $lte: THRESHOLD_48H } },
              ],
            },
          ],
          $or: [
            { "timers.cam_frozen_at": null },
            { "timers.cam_frozen_at": { $exists: false } },
          ],
        },
      ],
    };

    const moveToTrashRes = await PayRequest.updateMany(moveToTrashQuery, {
      $set: {
        "approval_status.stage": "Trash Pending",
        "timers.trash_started_at": now,
      },
      $push: {
        status_history: {
          stage: "Trash Pending",
          remarks: "Auto-moved after 48 hours in Draft/CAM",
          timestamp: now,
        },
      },
    });

    if (moveToTrashRes.modifiedCount) {
      console.log(`[Cron] Draft/CAM → Trash Pending: ${moveToTrashRes.modifiedCount}`);
    }
    const creditQuery = {
      "approval_status.stage": "Credit Pending",
      "credit.credit_deadline": { $lte: now },
    };

    const creditRes = await PayRequest.updateMany(creditQuery, {
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

    if (creditRes.modifiedCount) {
      console.log(`[Cron] CreditExpired → Draft: ${creditRes.modifiedCount}`);
    }
    const deleteQuery = {
      "approval_status.stage": "Trash Pending",
      "timers.trash_started_at": { $lte: TRASH_DELETE_THRESHOLD },
      approved: { $in: ["Pending", "Rejected"] },
    };

    const deleteRes = await PayRequest.deleteMany(deleteQuery);

    if (deleteRes.deletedCount) {
      console.log(`[Cron] Deleted Trash Pending >15d: ${deleteRes.deletedCount}`);
    }
  } catch (err) {
    console.error("[Cron] Error:", err);
  }
});
