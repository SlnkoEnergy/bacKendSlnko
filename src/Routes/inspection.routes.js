const router = require("express").Router();
const {
  getAllInspections,
  getInspectionById,
  updateInspection,
  deleteInspection,
  createInspection,
  updateStatusInspection,
} = require("../Controllers/inspection.controller");
const auth = require("../middlewares/auth.middleware.js");
const upload = require("../middlewares/multer.middleware.js");


router.get("/inspection", auth, getAllInspections);
router.get("/inspection/:id", auth, getInspectionById);
router.post("/inspection", auth, createInspection);
router.put("/inspection/:id", auth, updateInspection);
router.delete("/inspection/:id", auth, deleteInspection);
router.put('/:id/updateStatus', auth, upload,updateStatusInspection);

module.exports = router;
