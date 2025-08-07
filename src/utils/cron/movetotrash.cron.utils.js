const cron = require("node-cron");
const PayRequest = require("../../Modells/payRequestModells");

cron.schedule("* * * * *", async () => {
  const now = new Date();

  const draftThreshold = new Date(now.getTime() - 52 * 60 * 60 * 1000);
  const trashThreshold = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
  try {
    const expiredDrafts = await PayRequest.find({
      "approval_status.stage": "Draft",
      "timers.draft_started_at": { $lte: draftThreshold },
      "timers.draft_frozen_at": { $exists: false },
      approved: { $nin: ["Approved", "Rejected"] },
    });

    for (let req of expiredDrafts) {
      req.approval_status.stage = "Trash Pending";
      req.timers.trash_started_at = now;
      req.status_history.push({
        stage: "Trash Pending",
        remarks: "Auto-moved after 48 hrs",
        timestamp: now,
      });
      await req.save();
      console.log(`Moved to Trash Pending: ${req._id}`);
    }

    const oldTrash = await PayRequest.find({
      "approval_status.stage": "Trash Pending",
      "timers.trash_started_at": { $lte: trashThreshold },
      approved: { $nin: ["Approved", "Rejected"] },
    });

    for (let req of oldTrash) {
      await PayRequest.deleteOne({ _id: req._id });
      console.log(`Deleted from DB after 15 days in trash: ${req._id}`);
    }
  } catch (err) {
    console.error("Error in cron job:", err);
  }
});
