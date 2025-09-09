var router = require("express").Router();

const {
  createTask,
  getAllTasks,
  updateTask,
  getTaskById,
  deleteTask,
  updateTaskStatus,
  exportToCsv,
  createSubTask,
  updateSubTaskStatus,
} = require("../controllers/tasks.controllers");
const jwtMW = require("../middlewares/auth");
const upload = require("../middlewares/multer");

router.post("/task", jwtMW.authentication, createTask);
router.get("/task", jwtMW.authentication, getAllTasks);
router.get("/task/:id", jwtMW.authentication, getTaskById);
router.put("/task/:id", jwtMW.authentication,upload, updateTask);
router.delete("/task/:id", jwtMW.authentication, deleteTask);
router.put("/:id/updateTaskStatus", jwtMW.authentication, updateTaskStatus);
router.post("/exportTocsv", jwtMW.authentication, exportToCsv);
router.put('/subtask/:taskId', jwtMW.authentication, createSubTask);
module.exports = router;
