const router = require("express").Router();
const {
  listBillHistory,
  createBillHistory,
  updateBillHistory,
  deleteBillHistory,
  getBillHistory,
} = require("../Controllers/billHistory.controller");
const auth = require("../middlewares/auth.middleware.js");

router.get("/billHistory", auth, listBillHistory);
router.get("/billHistory/:id", auth, getBillHistory);
router.post("/billHistory", auth, createBillHistory);
router.put("/billHistory/:id", auth, updateBillHistory);
router.delete("/billHistory/:id", auth, deleteBillHistory);

module.exports = router;
