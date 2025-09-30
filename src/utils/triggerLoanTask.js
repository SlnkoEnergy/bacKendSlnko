const Task = require("../models/task.model");
const TaskCounter = require("../models/taskcounter.model");
const User = require("../models/user.model");

function deptToCode(dept) {
  return String(dept || "GEN")
    .trim()
    .slice(0, 2)
    .toUpperCase();
}

async function triggerLoanTasksBulk(payloads, session = null) {
  if (!payloads?.length) return { upserted: 0 };
  const userId = payloads[0].userId;
  const user = await User.findById(userId).session(session);
  if (!user) throw new Error("User not found");
  const deptCode = deptToCode(user.department);
  const n = payloads.length;

  const counterDoc = await TaskCounter.findOneAndUpdate(
    { createdBy: userId },
    { $inc: { count: n } },
    { new: true, upsert: true, session, setDefaultsOnInsert: true }
  );

  const end = counterDoc.count;
  const start = end - n + 1;
  const now = new Date();

  const ops = payloads.map((p, i) => {
    const taskCode = `T/${deptCode}/${String(start + i).padStart(3, "0")}`;
    return {
      updateOne: {
        filter: { sourceKey: p.sourceKey },
        update: {
          $setOnInsert: {
            sourceKey: p.sourceKey,
            source: p.source,
            taskCode,
            title: p.title,
            description: p.description,
            project_id: Array.isArray(p.project_id)
              ? p.project_id
              : [p.project_id],
            type: "project",
            createdBy: p.userId,
            deadline: p.deadline,
            assigned_to: Array.isArray(p.assigned_to)
              ? p.assigned_to
              : [p.assigned_to],
            current_status: {
              status: "pending",
              remarks:
                "Task created as dependency approved by system for Loan Team",
              user_id: null,
            },
            status_history: p.status_history || [
              {
                status: "pending",
                remarks:
                  "Task created as dependency approved by system for Loan Team",
                user_id: null,
                updatedAt: now,
              },
            ],
          },
        },
        upsert: true,
      },
    };
  });

  try {
    return await Task.bulkWrite(ops, { ordered: false, session });
  } catch (e) {
    const dupOnly =
      e?.name === "BulkWriteError" &&
      e?.writeErrors?.length &&
      e.writeErrors.every((we) => we.code === 11000);
    if (dupOnly) return { upserted: 0, duplicates: true };
    throw e;
  }
}

module.exports = { triggerLoanTasksBulk };
