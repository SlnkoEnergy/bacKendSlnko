const router = require("express").Router();
const {
  getLeadSummary,
  getLeadSource,
  taskDashboard,
  leadSummary,
  leadconversationrate,
  leadWonAndLost,
  leadFunnel,
} = require("../../Controllers/bdController/bdleadsController");
const {
  createGroup,
  getAllGroup,
  getGroupById,
  updateGroup,
  deleteGroup,
  updateGroupStatus,
  groupDropdown,
  getAllGroupDropdown,
  getexportToCSVGroup,
} = require("../../Controllers/bdController/groupController.js");
const {
  deleteLead,
  updateAssignedTo,
  exportLeadsCSV,
  updateLeadStatus,
  uploadDocuments,
  updateExpectedClosing,
  getLeadByLeadIdorId,
  getAllLeads,
  getAllLeadDropdown,
  editLead,
  createBDlead,
  updateAssignedToFromSubmittedBy,
  attachToGroup,
  getUniqueState,
  fixBdLeadsFields,
  getLeadCounts,
} = require("../../Controllers/bdController/leadsController.js");
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
  "/assign-to",
  jwtMW.authentication,
  jwtMW.authorization,
  updateAssignedTo
);
router.put(
  "/attach-group",
  jwtMW.authentication,
  jwtMW.authorization,
  attachToGroup
);
router.post(
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
router.get(
  "/states",
  jwtMW.authentication,
  jwtMW.authorization,
  getUniqueState
);
router.put(
  "/updatehandoverstatus",
  jwtMW.authentication,
  jwtMW.authorization,
  fixBdLeadsFields
);
router.get(
  "/lead-count",
  jwtMW.authentication,
  jwtMW.authorization,
  getLeadCounts
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
  getexportToCsv
);

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
router.post("/lead", jwtMW.authentication, jwtMW.authorization, createBDlead);

router.put("/bdleadupdate", migrateAllLeads);
router.put(
  "/updateAssignedto",
  jwtMW.authentication,
  jwtMW.authorization,
  updateAssignedToFromSubmittedBy
);

//Group
router.post("/group", jwtMW.authentication, jwtMW.authorization, createGroup);
router.get("/group", jwtMW.authentication, jwtMW.authorization, getAllGroup);
router.get(
  "/group/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  getGroupById
);
router.put(
  "/group/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateGroup
);
router.put(
  "/:id/updateGroupStatus",
  jwtMW.authentication,
  jwtMW.authorization,
  updateGroupStatus
);
router.delete(
  "/group/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteGroup
);
router.get(
  "/group-drop",
  jwtMW.authentication,
  jwtMW.authentication,
  getAllGroupDropdown
);
router.post(
  "/group-export",
  jwtMW.authentication,
  jwtMW.authentication,
  getexportToCSVGroup
);

module.exports = router;
