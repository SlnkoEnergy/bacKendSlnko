const Task = require("../models/task.model");
const TaskCounterSchema = require("../models/taskcounter.model");
const User = require("../models/user.model");

async function triggerTask(payload) {
  const { title, description, project_id, status_history, userId } = payload;
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  const dept = user?.department;
  if (!dept) throw new Error("User department not found");

  const counter = await TaskCounterSchema.findOneAndUpdate(
    { createdBy: userId },
    { $inc: { count: 1 } },
    { new: true, upsert: true }
  );
  const taskCode = `T/${deptCode}/${String(counter.count).padStart(3, "0")}`;
  const newTask = new Task({
    taskCode,
    title,
    description,
    project_id,
    type: "project",
    createdBy: userId,
    status_history,
  });
  await newTask.save();
  return newTask;
}

module.exports = triggerTask;
