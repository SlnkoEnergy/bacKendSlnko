const router = require("express").Router();

const {
  createTask,
  getAllTasks,
  updateTask,
  getTaskById,
  deleteTask,
  updateTaskStatus,
  exportToCsv,
  createSubTask,
  taskCards,
  myTasks,
  activityFeed,
  getUserPerformance,
  getProjectsByState,
  getAgingByResolution,
} = require("../Controllers/tasks.controllers");
const auth = require("../middlewares/auth.middleware.js");
const upload = require("../middlewares/multer.middleware.js");

router.post("/task", auth, createTask);
router.get("/task", auth, getAllTasks);
router.get("/task/:id", auth, getTaskById);
router.put("/task/:id", auth, upload, updateTask);
router.delete("/task/:id", auth, deleteTask);
router.put("/:id/updateTaskStatus", auth, updateTaskStatus);
router.post("/exportTocsv", auth, exportToCsv);
router.put("/subtask/:taskId", auth, createSubTask);

//Task Dashboard
router.get("/taskcards", auth, taskCards);
router.get("/mytasks", auth, myTasks);
router.get("/activityfeed", auth, activityFeed);
router.get("/userperformance", auth, getUserPerformance);
router.get("/projectstate", auth, getProjectsByState);
router.get("/agingbyresolution", auth, getAgingByResolution);
module.exports = router;
