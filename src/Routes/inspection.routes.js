const router = require("express").Router();
const {
  getAllInspections,
  getInspectionById,
  updateInspection,
  deleteInspection,
  createInspection,
  updateStatusInspection,
} = require("../Controllers/inspection.controller");
const jwtMW = require("../middlewares/auth");
const upload = require("../middlewares/multer");


router.get("/inspection", jwtMW.authentication, getAllInspections);
router.get("/inspection/:id", jwtMW.authentication, getInspectionById);
router.post("/inspection", jwtMW.authentication, createInspection);
router.put("/inspection/:id", jwtMW.authentication, updateInspection);
router.delete("/inspection/:id", jwtMW.authentication, deleteInspection);
router.put('/:id/updateStatus', jwtMW.authentication, upload,updateStatusInspection);

module.exports = router;
