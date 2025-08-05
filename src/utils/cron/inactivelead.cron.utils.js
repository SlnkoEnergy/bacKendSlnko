const cron = require("node-cron");
const BdLead = require("../../Modells/bdleads/bdleadsModells");

cron.schedule("0 0 * * *", async () => {
  try {
    const result = await BdLead.updateMany(
      {
        "current_status.name": { $ne: "won" }
      },
      {
        $inc: { inactivedays: 1 }
      }
    );
    console.log(`✅ inactivedays updated for ${result.modifiedCount} leads`);
  } catch (error) {
    console.error("❌ Error updating inactivedays:", error);
  }
});

