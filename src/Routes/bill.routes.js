const router = require("express").Router();
const {
  listBillHistory,
  createBillHistory,
  updateBillHistory,
  deleteBillHistory,
  getBillHistory,
} = require("../controllers/billHistory.controller");
const jwtMW = require("../middlewares/auth");

router.get("/billHistory", jwtMW.authentication, listBillHistory);
router.get("/billHistory/:id", jwtMW.authentication, getBillHistory);
router.post("/billHistory", jwtMW.authentication, createBillHistory);
router.put("/billHistory/:id", jwtMW.authentication, updateBillHistory);
router.delete("/billHistory/:id", jwtMW.authentication, deleteBillHistory);

module.exports = router;
