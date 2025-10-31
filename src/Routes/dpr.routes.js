const router = require("express").Router();
const {
  getAllDpr,
  getDprById,
  createDpr,
  updateDpr,
  updateDprStatus,
  deleteDpr,
} = require("../Controllers/dpr.controller");
const {
  getAllDprTasks,
  getDprTaskById,
  createDprTask,
  updateDprTask,
  updateStatusDprTask,
  deleteDprTask,
} = require("../Controllers/dprtask.controller");

const {
  createDPR,
  getAllActivities,
  updateDPR
} = require("../Controllers/dpractivities.controller");
const jwtMW = require("../middlewares/auth");

// DPR Routes
router.get("/dpr", auth, getAllDpr);
router.get("/dpr/:_id", auth, getDprById);
router.post("/dpr", auth, createDpr);
router.put("/dpr/:_id", auth, updateDpr);
router.put("/:_id/updateStatus", auth, updateDprStatus);
router.delete("/dpr/:_id", auth, deleteDpr);

// DPR Task Routes
router.get("/dpr-task", auth, getAllDprTasks);
router.get("/dpr-task/:_id", auth, getDprTaskById);
router.post("/dpr-task", auth, createDprTask);
router.put("/dpr-task/:_id", auth, updateDprTask);
router.put(
  "/:_id/updateStatusDprTask",
  auth,
  updateStatusDprTask
);
router.delete("/dpr-task/:_id", jwtMW.authentication, deleteDprTask);

router.post("/dpr-activities", auth, createDPR);
router.put("/update-dpr-activities", auth, updateDPR);
router.get("/dpr-activities-list", auth, getAllActivities);

module.exports = router;
