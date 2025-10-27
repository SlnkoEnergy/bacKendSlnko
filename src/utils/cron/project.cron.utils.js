const cron = require("node-cron");
const mongoose = require("mongoose");
const projectModel = require("../../models/project.model");

const DAY_MS = 24 * 60 * 60 * 1000;

cron.schedule("0 0 * * *", async () => {
  try {
    const projects = await projectModel
      .find(
        {},
        "_id project_completion_date bd_commitment_date ppa_expiry_date current_status remaining_days"
      )
      .lean();

    const ops = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const p of projects) {
      const rawDates = [
        p.project_completion_date,
        p.bd_commitment_date,
        p.ppa_expiry_date,
      ].filter(Boolean);

      if (!rawDates.length) continue;

      // earliest of the dates
      const minDate = new Date(
        Math.min(...rawDates.map((d) => new Date(d).getTime()))
      );

      const remainingDays = Math.ceil(
        (minDate.setHours(0, 0, 0, 0) - today.getTime()) / DAY_MS
      );

      const update = { $set: { remaining_days: remainingDays } };

      const currentStatus = (p.current_status?.status || "").toLowerCase();
      if (remainingDays < 0 && currentStatus !== "delayed") {
        const now = new Date();
        const remarks =
          "Auto-marked as delayed by daily deadline check (earliest commitment/completion date has passed).";

        update.$set.current_status = {
          status: "delayed",
          remarks,
          updated_at: now,
        };

        update.$push = {
          status_history: {
            status: "delayed",
            remarks,
            updated_at: now,
          },
        };
      }

      ops.push({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(p._id) },
          update,
        },
      });
    }

    if (ops.length) {
      await projectModel.bulkWrite(ops, { ordered: false });
    }
  } catch (err) {
    console.error("Error in project deadline cron:", err);
  }
});
