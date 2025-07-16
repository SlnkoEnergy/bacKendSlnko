var router = require("express").Router();

const {
  createTask,
  getAllTasks,
  updateTask,
  getTaskById,
  deleteTask,
  updateTaskStatus,
  exportToCsv,
} = require("../../Controllers/tasksController/tasksControllers");
const jwtMW = require("../../middlewares/auth");

router.post("/task", jwtMW.authentication, jwtMW.authorization, createTask);
router.get("/task", jwtMW.authentication, jwtMW.authorization, getAllTasks);
router.get("/task/:id", jwtMW.authentication, jwtMW.authorization, getTaskById);
router.put("/task/:id", jwtMW.authentication, jwtMW.authorization, updateTask);
router.delete(
  "/task/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteTask
);
router.put(
  "/:id/updateTaskStatus",
  jwtMW.authentication,
  jwtMW.authorization,
  updateTaskStatus
);
router.get(
  "/exportTocsv",
  jwtMW.authentication,
  jwtMW.authorization,
  exportToCsv
);
module.exports = router;
