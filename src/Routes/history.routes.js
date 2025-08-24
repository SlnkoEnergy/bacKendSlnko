const router = require("express").Router();
const {
  listHistory,
  createHistory,
  updateHistory,
  deleteHistory,
  getHistory,
} = require("../Controllers/history.controller");
const jwtMW = require("../middlewares/auth");

router.get("/history", jwtMW.authentication, listHistory);
router.get("/history/:id", jwtMW.authentication, getHistory);
router.post("/history", jwtMW.authentication, createHistory);
router.put("/history/:id", jwtMW.authentication, updateHistory);
router.delete("/history/:id", jwtMW.authentication, deleteHistory);

module.exports = router;
