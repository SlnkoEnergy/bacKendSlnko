const router = require("express").Router();
const {
  getAllLeads,
  getLeadSummary,
  getLeadSource,
  taskDashboard,
  leadSummary,
  leadconversationrate,
  getLeadByLeadIdorId,
  leadWonAndLost,
  leadFunnel,
  getAllLeadDropdown,
  editLead,
  deleteLead,
  updateAssignedToFromSubmittedBy,
  updateAssignedTo,
  exportLeadsCSV,
  updateLeadStatus,
  uploadDocuments,
  createBDlead,
  updateExpectedClosing,
} = require("../../Controllers/bdController/bdleadsController");
const {
  getNotesById,
  createNotes,
  updateNotes,
  deleteNotes,
  getNotesByLeadId,
} = require("../../Controllers/bdController/notesController");
const {
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  updateStatus,
  getAllTask,
  getTaskByLeadId,
  toggleViewTask,
  getNotifications,
  getAllTaskByAssigned,
  migrateAllLeads,
  getexportToCsv,
} = require("../../Controllers/bdController/taskController");
const jwtMW = require("../../middlewares/auth");
const upload = require("../../middlewares/multer.js");

// Bd lead Dashboard Routes
router.get(
  "/summary",
  jwtMW.authentication,
  jwtMW.authorization,
  getLeadSummary
);
router.get(
  "/lead-source",
  jwtMW.authentication,
  jwtMW.authorization,
  getLeadSource
);
router.get(
  "/taskdashboard",
  jwtMW.authentication,
  jwtMW.authorization,
  taskDashboard
);
router.get(
  "/lead-summary",
  jwtMW.authentication,
  jwtMW.authorization,
  leadSummary
);
router.get(
  "/lead-conversation",
  jwtMW.authentication,
  jwtMW.authorization,
  leadconversationrate
);

// Lead Routes
router.get("/all-lead", jwtMW.authentication, jwtMW.authorization, getAllLeads);
router.get(
  "/lead-details",
  jwtMW.authentication,
  jwtMW.authorization,
  getLeadByLeadIdorId
);
router.get(
  "/lead-funnel",
  jwtMW.authentication,
  jwtMW.authorization,
  leadFunnel
);
router.get(
  "/wonandlost",
  jwtMW.authentication,
  jwtMW.authorization,
  leadWonAndLost
);
router.get(
  "/all-lead-dropdown",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllLeadDropdown
);
router.put("/lead/:_id", jwtMW.authentication, jwtMW.authorization, editLead);
router.delete(
  "/lead/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteLead
);
router.put(
  "/assign-to/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateAssignedTo
);
router.get(
  "/export-lead",
  jwtMW.authentication,
  jwtMW.authorization,
  exportLeadsCSV
);
router.put(
  "/:_id/updateLeadStatus",
  jwtMW.authentication,
  jwtMW.authorization,
  updateLeadStatus
);
router.put(
  "/uploadDocuments",
  jwtMW.authentication,
  jwtMW.authorization,
  upload,
  uploadDocuments
);
router.put(
  "/:_id/updateClosingDate",
  jwtMW.authentication,
  jwtMW.authorization,
  updateExpectedClosing
);

// Task Routes
router.get(
  "/bd-tasks/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  getTaskById
);
router.post("/bd-tasks", jwtMW.authentication, jwtMW.authorization, createTask);
router.put(
  "/bd-tasks/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateTask
);
router.delete(
  "/bd-tasks/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteTask
);
router.put(
  "/:_id/updateStatus",
  jwtMW.authentication,
  jwtMW.authorization,
  updateStatus
);
router.get("/all-tasks", jwtMW.authentication, jwtMW.authorization, getAllTask);
router.get(
  "/bd-tasks",
  jwtMW.authentication,
  jwtMW.authorization,
  getTaskByLeadId
);
router.put(
  "/notification/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  toggleViewTask
);
router.get(
  "/notification",
  jwtMW.authentication,
  jwtMW.authorization,
  getNotifications
);
router.get(
  "/task-assign",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllTaskByAssigned
);
router.post(
  "/task-export",
  jwtMW.authentication,
  jwtMW.authorization,
  getexportToCsv,
)

//Notes Routes
router.get(
  "/bd-notes/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  getNotesById
);
router.post(
  "/bd-notes",
  jwtMW.authentication,
  jwtMW.authorization,
  createNotes
);
router.put(
  "/bd-notes/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateNotes
);
router.delete(
  "/bd-notes/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteNotes
);
router.get(
  "/bd-notes",
  jwtMW.authentication,
  jwtMW.authorization,
  getNotesByLeadId
);
router.post(
  "/lead",
  jwtMW.authentication,
  jwtMW.authorization,
  createBDlead
);

router.put("/bdleadupdate", migrateAllLeads);
router.put(
  "/updateAssignedto",
  jwtMW.authentication,
  jwtMW.authorization,
  updateAssignedToFromSubmittedBy
);

module.exports = router;
