const router = require("express").Router();
const {
  createLoan,
  getAllLoans,
  getLoanById,
  deleteLoan,
  updateLoan,
  updateLoanStatus,
  getUniqueBank,
} = require("../controllers/loan.controller");
const auth = require("../middlewares/auth.middleware");
const upload = require("../middlewares/multer.middleware");

router.post("/", auth, upload, createLoan);
router.get("/", auth, getAllLoans);
router.get("/unique-bank", auth, getUniqueBank);
router.get("/:id", auth, getLoanById);
router.put("/:id", auth, updateLoan);
router.patch("/:id/status", auth, updateLoanStatus);
router.delete("/:id", auth, deleteLoan);

module.exports = router;
