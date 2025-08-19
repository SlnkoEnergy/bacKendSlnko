const router = require("express").Router();
const {
  getAllLogistics,
  getLogisticById,
  createLogistic,
  updateLogistic,
  deleteLogistic,
} = require("../Controllers/logistics.controller");

const jwtMW = require("../middlewares/auth");

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
  updateLogistic
);

router.delete(
  "/logistic/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteLogistic
);

module.exports = router;
