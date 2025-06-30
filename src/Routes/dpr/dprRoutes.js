const router = require("express").Router();
const {
  getAllDpr,
  getDprById,
  createDpr,
  updateDpr,
  updateDprStatus,
  deleteDpr,
} = require("../../Controllers/dprController/dprController");
const jwtMW = require("../../middlewares/auth");

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

module.exports = router;
