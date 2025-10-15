const router = require("express").Router();
const auth = require("../middlewares/auth.middleware.js");
const {
  createhandoversheet,
  gethandoversheetdata,
  edithandoversheetdata,
  updatestatus,
  getByIdOrLeadId,
  getexportToCsv,
  migrateProjectToHandover,
  updateAssignedTo,
  ManipulateHandover,
  ManipulateHandoverSubmittedBy,
  manipulatesubmittedbyBD,
} = require("../Controllers/handoversheet.controller.js");

//handoversheet
router.post(
  "/create-hand-over-sheet",
  auth,
  createhandoversheet
);
router.post("/handover-export", auth, getexportToCsv);
router.get(
  "/get-all-handover-sheet",
  auth,
  gethandoversheetdata
);
router.put(
  "/edit-hand-over-sheet/:_id",
  auth,
  edithandoversheetdata
);
router.put("/update-status/:_id", auth, updatestatus);
router.get("/get-handoversheet", auth, getByIdOrLeadId);
router.put("/migrateProject", auth, migrateProjectToHandover);
router.put("/updateAssignedto/:id", auth, updateAssignedTo);
router.get("/manipulate-handover", ManipulateHandover);
router.get("/manipulate-handover-submitted", ManipulateHandoverSubmittedBy);
router.put(
  "/manipulatesubmittedby",
  auth,
  manipulatesubmittedbyBD
);

module.exports = router;
