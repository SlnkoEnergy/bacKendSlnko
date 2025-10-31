const router = require("express").Router();
const {
  createLoan,
  getAllLoans,
  getLoanById,
  deleteLoan,
  updateLoan,
  updateLoanStatus,
  getUniqueBank,
  addComment,
  uploadExistingDocument,
} = require("../controllers/loan.controller");
const auth = require("../middlewares/auth.middleware");
const upload = require("../middlewares/multer.middleware");

router.post("/", auth, upload, createLoan);
router.get("/", auth, getAllLoans);
router.get("/unique-bank", auth, getUniqueBank);
router.get("/loan", auth, getLoanById);
router.put("/:id", auth, updateLoan);
router.patch("/:project_id/status", auth, updateLoanStatus);
router.delete("/:id", auth, deleteLoan);
router.patch("/comment", auth, addComment);
router.patch('/upload-existing-document', auth, upload, uploadExistingDocument)

module.exports = router;
