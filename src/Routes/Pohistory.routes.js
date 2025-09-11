const router = require("express").Router();
const {
  listPoHistory,
  createPoHistory,
  updatePoHistory,
  deletePoHistory,
  getPoHistory,
} = require("../controllers/Pohistory.controller");
const jwtMW = require("../middlewares/auth");

router.get("/Pohistory", jwtMW.authentication, listPoHistory);
router.get("/PoHistory/:id", jwtMW.authentication, getPoHistory);
router.post("/PoHistory", jwtMW.authentication, createPoHistory);
router.put("/PoHistory/:id", jwtMW.authentication, updatePoHistory);
router.delete("/PoHistory/:id", jwtMW.authentication, deletePoHistory);

module.exports = router;
