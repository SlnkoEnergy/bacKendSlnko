const router = require("express").Router();
const {
  getAllDpr,
  getDprById,
  createDpr,
  updateDpr,
  updateDprStatus,
  deleteDpr,
} = require("../controllers/dprController/dprController");
const {
  getAllDprTasks,
  getDprTaskById,
  createDprTask,
  updateDprTask,
  updateStatusDprTask,
  deleteDprTask,
} = require("../controllers/dprController/dprTaskController");
const jwtMW = require("../middlewares/auth");

// DPR Routes
router.get("/dpr", jwtMW.authentication, getAllDpr);
router.get("/dpr/:_id", jwtMW.authentication, getDprById);
router.post("/dpr", jwtMW.authentication, createDpr);
router.put("/dpr/:_id", jwtMW.authentication, updateDpr);
router.put("/:_id/updateStatus", jwtMW.authentication, updateDprStatus);
router.delete("/dpr/:_id", jwtMW.authentication, deleteDpr);

// DPR Task Routes
router.get("/dpr-task", jwtMW.authentication, getAllDprTasks);
router.get("/dpr-task/:_id", jwtMW.authentication, getDprTaskById);
router.post("/dpr-task", jwtMW.authentication, createDprTask);
router.put("/dpr-task/:_id", jwtMW.authentication, updateDprTask);
router.put(
  "/:_id/updateStatusDprTask",
  jwtMW.authentication,
  updateStatusDprTask
);
router.delete("/dpr-task/:_id", jwtMW.authentication, deleteDprTask);

module.exports = router;
