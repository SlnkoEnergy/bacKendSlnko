const router = require("express").Router();
const {
  getAllLogistics,
  getLogisticById,
  createLogistic,
  updateLogistic,
  deleteLogistic,
  updateLogisticStatus,
} = require("../Controllers/logistics.controller");
const {
  listLogisticHistory,
  getLogisticHistory,
  createLogisticHistory,
  updateLogisticHistory,
  deleteLogisticHistory,
} = require("../Controllers/logisticshistory.controller");

const auth = require("../middlewares/auth.middleware.js");
const upload = require("../middlewares/multer");
// Logistic Routes
router.get("/logistic", auth, getAllLogistics);

router.get("/logistic/:id", auth, getLogisticById);

router.post("/logistic", auth, createLogistic);
router.put("/logistic/:_id", auth, upload, updateLogistic);

router.delete("/logistic/:_id", auth, deleteLogistic);
router.put("/logistic/:id/status", auth, updateLogisticStatus);

router.get("/logistichistory", auth, listLogisticHistory);
router.get("/logistichistory/:id", auth, getLogisticHistory);
router.post("/logistichistory", auth, createLogisticHistory);
router.put("/logistichistory/:id", auth, updateLogisticHistory);
router.delete(
  "/LogisticHistory/:id",
  auth,
  deleteLogisticHistory
);

module.exports = router;
