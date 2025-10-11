const router = require("express").Router();
const jwtMW = require("../middlewares/auth.js");
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

//handdoversheet
router.post(
  "/create-hand-over-sheet",
  jwtMW.authentication,
  createhandoversheet
);
router.post("/handover-export", jwtMW.authentication, getexportToCsv);
router.get(
  "/get-all-handover-sheet",
  jwtMW.authentication,
  gethandoversheetdata
);
router.put(
  "/edit-hand-over-sheet/:_id",
  jwtMW.authentication,
  edithandoversheetdata
);
router.put("/update-status/:_id", jwtMW.authentication, updatestatus);
router.get("/get-handoversheet", jwtMW.authentication, getByIdOrLeadId);
router.put("/migrateProject", jwtMW.authentication, migrateProjectToHandover);
router.put("/updateAssignedto/:id", jwtMW.authentication, updateAssignedTo);
router.get("/manipulate-handover", ManipulateHandover);
router.get("/manipulate-handover-submitted", ManipulateHandoverSubmittedBy);
router.put(
  "/manipulatesubmittedby",
  jwtMW.authentication,
  manipulatesubmittedbyBD
);

module.exports = router;
