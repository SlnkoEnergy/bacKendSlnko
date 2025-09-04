const router = require("express").Router();
const {
  getAllLogistics,
  getLogisticById,
  createLogistic,
  updateLogistic,
  deleteLogistic,
  updateLogisticStatus,
} = require("../controllers/logistics.controller");
const {
  listLogisticHistory,
  getLogisticHistory,
  createLogisticHistory,
  updateLogisticHistory,
  deleteLogisticHistory,
} = require("../controllers/logisticshistory.controller");

const jwtMW = require("../middlewares/auth");
const upload = require("../middlewares/multer");
// Logistic Routes
router.get("/logistic", jwtMW.authentication, getAllLogistics);

router.get("/logistic/:id", jwtMW.authentication, getLogisticById);

router.post("/logistic", jwtMW.authentication, createLogistic);
router.put("/logistic/:_id", jwtMW.authentication, upload, updateLogistic);

router.delete("/logistic/:_id", jwtMW.authentication, deleteLogistic);
router.put("/logistic/:id/status", jwtMW.authentication, updateLogisticStatus);

router.get("/logistichistory", jwtMW.authentication, listLogisticHistory);
router.get("/logistichistory/:id", jwtMW.authentication, getLogisticHistory);
router.post("/logistichistory", jwtMW.authentication, createLogisticHistory);
router.put("/logistichistory/:id", jwtMW.authentication, updateLogisticHistory);
router.delete(
  "/LogisticHistory/:id",
  jwtMW.authentication,
  deleteLogisticHistory
);

module.exports = router;
