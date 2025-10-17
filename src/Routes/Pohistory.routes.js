const router = require("express").Router();
const {
  listPoHistory,
  createPoHistory,
  updatePoHistory,
  deletePoHistory,
  getPoHistory,
} = require("../Controllers/Pohistory.controller");
const auth = require("../middlewares/auth.middleware.js");

router.get("/Pohistory", auth, listPoHistory);
router.get("/PoHistory/:id", auth, getPoHistory);
router.post("/PoHistory", auth, createPoHistory);
router.put("/PoHistory/:id", auth, updatePoHistory);
router.delete("/PoHistory/:id", auth, deletePoHistory);

module.exports = router;
