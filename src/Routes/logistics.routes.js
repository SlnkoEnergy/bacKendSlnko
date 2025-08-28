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

const jwtMW = require("../middlewares/auth");
const upload = require("../middlewares/multer");
// Logistic Routes
router.get(
  "/logistic",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllLogistics
);

router.get(
  "/logistic/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  getLogisticById
);

router.post(
  "/logistic",
  jwtMW.authentication,
  jwtMW.authorization,
  createLogistic
);
router.put(
  "/logistic/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  upload,
  updateLogistic
);

router.delete(
  "/logistic/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteLogistic
);
router.put(
  "/logistic/:id/status",
  jwtMW.authentication,
  jwtMW.authorization,
  updateLogisticStatus
);

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
