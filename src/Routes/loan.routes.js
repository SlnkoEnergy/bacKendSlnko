const router = require("express").Router();
const {
  createLoan,
  getAllLoans,
  getLoanById,
  deleteLoan,
  updateLoan,
  updateLoanStatus,
} = require("../controllers/loan.controller");
const auth = require("../middlewares/auth.middleware");

router.post("/", auth, createLoan);
router.get("/", auth, getAllLoans);
router.get("/:id", auth, getLoanById);
router.put("/:id", auth, updateLoan);
router.patch("/:id/status", auth, updateLoanStatus);
router.delete("/:id", auth, deleteLoan);

module.exports = router;
