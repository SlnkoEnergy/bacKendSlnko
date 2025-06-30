const router = require("express").Router();
const {
  getAllDpr,
  getDprById,
  createDpr,
  updateDpr,
  updateDprStatus,
  deleteDpr,
} = require("../../Controllers/dprController/dprController");
const {
  getAllDprTasks,
  getDprTaskById,
  createDprTask,
  updateDprTask,
  updateStatusDprTask,
  deleteDprTask,
} = require("../../Controllers/dprController/dprTaskController");
const jwtMW = require("../../middlewares/auth");

// DPR Routes
router.get("/dpr", jwtMW.authentication, jwtMW.authorization, getAllDpr);
router.get("/dpr/:_id", jwtMW.authentication, jwtMW.authorization, getDprById);
router.post("/dpr", jwtMW.authentication, jwtMW.authorization, createDpr);
router.put("/dpr/:_id", jwtMW.authentication, jwtMW.authorization, updateDpr);
router.put(
  "/:_id/updateStatus",
  jwtMW.authentication,
  jwtMW.authorization,
  updateDprStatus
);
router.delete(
  "/dpr/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteDpr
);

// DPR Task Routes
router.get(
  "/dpr-task",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllDprTasks
);
router.get(
  "/dpr-task/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  getDprTaskById
);
router.post(
  "/dpr-task",
  jwtMW.authentication,
  jwtMW.authorization,
  createDprTask
);
router.put(
  "/dpr-task/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateDprTask
);
router.put(
  "/:_id/updateStatusDprTask",
  jwtMW.authentication,
  jwtMW.authorization,
  updateStatusDprTask
);
router.delete(
  "/dpr-task/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteDprTask
);

module.exports = router;
